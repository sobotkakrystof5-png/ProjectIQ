'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sql } from '@/lib/db'
import { adminDb } from '@/lib/admin/db'
import { feedbackSchema, bookingSchema, surveySchema, surveyScoreSchema } from '@/lib/feedback-schema'
import { sendBrandedEmail } from '@/lib/email'
import {
  claimDetractorAlert,
  markGoogleReviewClick,
  saveSurveyScore as saveSurveyScoreInDb,
  submitSurveyAnswers,
} from '@/lib/admin/survey-answers'
import { alertDetractor, notifySurveySubmitted } from '@/lib/admin/survey-notify'
import { createNotification } from '@/lib/notifications'
import { projectPath, adminEmail } from '@/lib/lead-origins'
import { clientRequestSchema, REQUEST_KIND_LABELS } from '@/lib/client-requests'
import { publicToken } from '@/lib/public-token'
import { summarizeClientRequest } from '@/lib/client-request-ai'
import { finishConsultationBooking } from '@/lib/admin/consultations'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'

type ActionResult = { success: boolean; error?: string }

async function getProjectByToken(token: string): Promise<{ id: string } | null> {
  // `public_token` je uuid — nesmyslný token nesmí dojít do dotazu (22P02 → 500).
  const valid = publicToken(token)
  if (!valid) return null
  const rows = await sql`SELECT id FROM projects WHERE public_token = ${valid} LIMIT 1`
  const row = rows[0] as { id: string } | undefined
  return row ? { id: row.id } : null
}

// Throttle abuse of public, unauthenticated endpoints (token-only protection).
// One query per table, kept as tagged templates (never raw/interpolated SQL) —
// add a line here for any new public-action table instead of hardcoding a
// two-way ternary.
const RATE_LIMIT_QUERIES: Record<
  'client_feedback' | 'consultation_slots' | 'client_requests',
  (id: string, windowMinutes: number) => Promise<{ count: string }[]>
> = {
  client_feedback: (id, windowMinutes) =>
    sql`SELECT count(*) FROM client_feedback WHERE project_id = ${id} AND created_at > now() - interval '1 minute' * ${windowMinutes}` as unknown as Promise<{ count: string }[]>,
  consultation_slots: (id, windowMinutes) =>
    sql`SELECT count(*) FROM consultation_slots WHERE project_id = ${id} AND created_at > now() - interval '1 minute' * ${windowMinutes}` as unknown as Promise<{ count: string }[]>,
  client_requests: (id, windowMinutes) =>
    sql`SELECT count(*) FROM client_requests WHERE project_id = ${id} AND created_at > now() - interval '1 minute' * ${windowMinutes}` as unknown as Promise<{ count: string }[]>,
}

async function isRateLimited(
  table: keyof typeof RATE_LIMIT_QUERIES,
  id: string,
  windowMinutes: number,
  maxCount: number,
): Promise<boolean> {
  const rows = await RATE_LIMIT_QUERIES[table](id, windowMinutes)
  return parseInt(rows[0].count, 10) >= maxCount
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function submitFeedback(
  token: string,
  rawData: { nps: number; content?: string },
): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(rawData)
  if (!parsed.success) return { success: false, error: 'Neplatná data hodnocení.' }

  const project = await getProjectByToken(token)
  if (!project) return { success: false, error: 'Projekt nenalezen.' }
  const { id: projectId } = project

  if (await isRateLimited('client_feedback', projectId, 10, 3)) {
    return { success: false, error: 'Příliš mnoho hodnocení v krátkém čase. Zkuste to prosím později.' }
  }

  const projectRows = await sql`SELECT client_name FROM projects WHERE id = ${projectId} LIMIT 1`
  const clientName = (projectRows[0] as { client_name: string } | undefined)?.client_name ?? 'Neznámý klient'

  await sql`
    INSERT INTO client_feedback (project_id, nps, content)
    VALUES (${projectId}, ${parsed.data.nps}, ${parsed.data.content ?? null})
  `

  revalidatePath(projectPath(projectId))

  void createNotification({
    type: 'feedback_submitted',
    title: `Nové hodnocení od klienta — ${clientName}`,
    body: `NPS: ${parsed.data.nps}/10${parsed.data.content ? ' · ' + parsed.data.content : ''}`,
    link: projectPath(projectId),
  })

  const to = adminEmail()
  if (to) {
    await sendBrandedEmail({
      to,
      subject: `Nové hodnocení od klienta – ${clientName}`,
      heading: 'Nové hodnocení projektu',
      intro: `Klient ${clientName} právě odeslal hodnocení přes klientský portál.`,
      fields: [
        { label: 'Klient', value: clientName },
        { label: 'NPS hodnocení', value: `${parsed.data.nps} / 10` },
        ...(parsed.data.content ? [{ label: 'Komentář', value: parsed.data.content }] : []),
      ],
    })
  }

  return { success: true }
}

// ─── Consultation booking ──────────────────────────────────────────────────────

function generateMeetingLink(channel: string, datetime: Date): string {
  switch (channel) {
    case 'whatsapp': {
      const phone = process.env.ADMIN_PHONE ?? ''
      const formattedTime = datetime.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })
      return `https://wa.me/${phone}?text=${encodeURIComponent('Konzultace ' + formattedTime)}`
    }
    case 'teams':
      return process.env.TEAMS_MEETING_LINK ?? '#'
    case 'meet':
      return process.env.GOOGLE_MEET_LINK ?? '#'
    case 'phone':
      return `tel:${process.env.ADMIN_PHONE ?? ''}`
    default:
      return '#'
  }
}

const BOOKING_MAX_AHEAD_MS = 183 * 24 * 60 * 60 * 1000

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  teams: 'Microsoft Teams',
  meet: 'Google Meet',
  phone: 'Klasický hovor',
  other: 'Jiné',
}

export async function submitConsultation(
  token: string,
  rawData: { clientWish: string; scheduledAt: string; channel: string; channelOtherText?: string; clientEmail: string },
): Promise<ActionResult> {
  const parsed = bookingSchema.safeParse(rawData)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Neplatná data.' }

  const scheduledDate = new Date(parsed.data.scheduledAt)
  if (scheduledDate <= new Date()) return { success: false, error: 'Nelze rezervovat termín v minulosti.' }
  // Horní mez (audit 2026-11-15): rezervace na rok 3000 by jen zabírala kalendář.
  if (scheduledDate.getTime() > Date.now() + BOOKING_MAX_AHEAD_MS) {
    return { success: false, error: 'Termín jde vybrat nejvýš půl roku dopředu.' }
  }

  const project = await getProjectByToken(token)
  if (!project) return { success: false, error: 'Projekt nenalezen.' }
  const { id: projectId } = project

  if (await isRateLimited('consultation_slots', projectId, 30, 3)) {
    return { success: false, error: 'Příliš mnoho rezervací v krátkém čase. Zkuste to prosím později.' }
  }
  // Pokusy včetně neúspěšných (obsazený čas, mimo volno): každý bere zámek
  // rezervací, takže se odkaz /p nesmí dát použít k jejich zdržování (KP14).
  const attemptKey = `p-konzultace:${projectId}`
  if (await isApiRateLimited(attemptKey, 'token', 10, 15)) {
    return { success: false, error: 'Zkoušíte to hodně často. Počkejte prosím pár minut.' }
  }
  await recordApiRequest(attemptKey, 'token')

  // Google Meet zakládá dokončení rezervace (Google účet Kryštofa, R-114);
  // ostatní kanály mají odkaz hned.
  const meetingLink = parsed.data.channel === 'meet' ? null : generateMeetingLink(parsed.data.channel, scheduledDate)

  // Rezervace jde jedinou cestou s klientským prostorem (KP14, migrace 123):
  // databáze ověří, že čas leží ve volnu pro klienty a nic ho nezabírá, pod
  // zámkem založí rezervaci, kalendářní událost i kontakt v Hovorech.
  let slotId: string
  try {
    const rows = await adminDb<{ id: string }>`
      SELECT consultation_book(
        ${projectId}, ${scheduledDate.toISOString()}, ${parsed.data.channel}, ${parsed.data.channelOtherText ?? null},
        ${parsed.data.clientWish}, ${parsed.data.clientEmail}, ${meetingLink}, 'odkaz', NULL
      )::text AS id
    `
    slotId = String(rows[0].id)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === '23505' || code === '23P01') {
      return { success: false, error: 'Tenhle čas už není volný. Vyberte prosím jiný.' }
    }
    console.error('[Booking] Rezervace se neuložila:', (err as { code?: string })?.code ?? 'unknown')
    return { success: false, error: 'Rezervace se nepovedla. Zkuste to prosím znovu.' }
  }

  const to = adminEmail()
  const formattedTime = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(scheduledDate)
  const channelName = parsed.data.channel === 'other'
    ? (parsed.data.channelOtherText ?? 'Jiné')
    : (CHANNEL_LABEL[parsed.data.channel] ?? parsed.data.channel)

  if (to) {
    await sendBrandedEmail({
      to,
      subject: 'Nová rezervace konzultace – ZakazIQ',
      heading: 'Nová rezervace konzultace',
      intro: 'Klient si přes odkaz na projekt zarezervoval konzultaci ve vašem volnu.',
      fields: [
        { label: 'Datum a čas', value: formattedTime },
        { label: 'Komunikační kanál', value: channelName },
        { label: 'E-mail z formuláře', value: parsed.data.clientEmail },
        { label: 'Přání klienta', value: parsed.data.clientWish },
      ],
      ...(meetingLink ? { ctas: [{ label: 'Připojit se ke konzultaci', href: meetingLink }] } : {}),
    })
  }

  // Meet, potvrzení klientovi a zvonek doběhnou po odpovědi (KP14). Potvrzení
  // jde jen na e-mail klienta uložený u zakázky (audit 2026-11-15): adresa
  // z formuláře se uloží k rezervaci a dostane ji admin, ale server na ni nic
  // neposílá — jinak by kdokoli s odkazem /p rozesílal z naší schránky e-maily
  // s vlastním textem na libovolné adresy.
  after(() => finishConsultationBooking(slotId).catch((err) =>
    console.error('[Booking] Dokončení rezervace selhalo:', err instanceof Error ? err.name : 'unknown'),
  ))

  // Rezervace je od AD10 vidět v kalendáři i v Hovorech.
  revalidatePath('/dashboard/calendar')
  revalidatePath('/dashboard/calls')
  revalidatePath(`/p/${token}`)

  return { success: true }
}

// ─── Dotazník spokojenosti (R-119) ──────────────────────────────────────────────
//
// Zakázku najde tajný `survey_token` z odkazu v e-mailu; nic jiného se
// z prohlížeče nebere. Limit pokusů tu nahrazuje jediná odpověď na zakázku
// (unikátní index z migrace 106): opakované odeslání jen přepisuje tentýž
// řádek, dokud není formulář odeslaný, a upozornění odchází jednou.

/** Kolik se čeká, než po samotné známce 0–6 odejde upozornění. */
const DETRACTOR_ALERT_DELAY_MS = 20_000

export type SurveyScoreResult = { success: true } | { success: false; error: string; completed?: boolean }

export async function saveSurveyScore(token: string, nps: number): Promise<SurveyScoreResult> {
  const surveyToken = publicToken(token)
  if (!surveyToken) return { success: false, error: 'Dotazník jsme nenašli. Zkontrolujte prosím odkaz z e-mailu.' }
  const parsed = surveyScoreSchema.safeParse({ nps })
  if (!parsed.success) return { success: false, error: 'Vyberte prosím číslo od 0 do 10.' }

  const res = await saveSurveyScoreInDb(surveyToken, parsed.data.nps)
  if (res.status === 'not_found') {
    return { success: false, error: 'Dotazník jsme nenašli. Zkontrolujte prosím odkaz z e-mailu.' }
  }
  if (res.status === 'completed') {
    return { success: false, completed: true, error: 'Dotazník už je odeslaný. Děkuji!' }
  }

  revalidatePath(projectPath(res.project.id))
  // Nízká známka: když klient formulář nedokončí, Kryštof se to dozví i tak.
  // Po odkladu se znovu ověří, že známka pořád platí a formulář neodešel
  // (to pak upozorní odeslání, i s textem klienta).
  if (parsed.data.nps <= 6) {
    const surveyId = res.surveyId
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, DETRACTOR_ALERT_DELAY_MS))
      const alert = await claimDetractorAlert(surveyId, { onlyUnfinished: true })
      if (alert) await alertDetractor(alert.answer, alert.project)
    })
  }
  return { success: true }
}

export async function submitSurvey(token: string, rawData: unknown): Promise<SurveyScoreResult> {
  const surveyToken = publicToken(token)
  if (!surveyToken) return { success: false, error: 'Dotazník jsme nenašli. Zkontrolujte prosím odkaz z e-mailu.' }
  const parsed = surveySchema.safeParse(rawData)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím odpovědi.' }

  const res = await submitSurveyAnswers(surveyToken, parsed.data)
  if (res.status === 'not_found') {
    return { success: false, error: 'Dotazník jsme nenašli. Zkontrolujte prosím odkaz z e-mailu.' }
  }
  if (res.status === 'completed') {
    return { success: false, completed: true, error: 'Dotazník už je odeslaný. Děkuji!' }
  }

  revalidatePath(projectPath(res.project.id))
  revalidatePath('/dashboard/profil')

  const { answer, project } = res
  after(async () => {
    const alert = answer.nps !== null && answer.nps <= 6 ? await claimDetractorAlert(answer.id) : null
    if (alert) await alertDetractor(alert.answer, alert.project)
    else await notifySurveySubmitted(answer, project)
  })
  return { success: true }
}

/** Spokojený klient klikl na „Napsat recenzi na Googlu". Jen pro přehled. */
export async function recordGoogleReviewClick(token: string): Promise<void> {
  const surveyToken = publicToken(token)
  if (!surveyToken) return
  await markGoogleReviewClick(surveyToken).catch((err) => {
    console.error('[Dotazník] Kliknutí na recenzi se nepodařilo zapsat.', err instanceof Error ? err.message : err)
  })
}

// ─── Požadavek klienta (text nebo přepis hlasu) ─────────────────────────────────

export async function submitClientRequest(
  token: string,
  rawData: { text: string; source: 'text' | 'voice' },
): Promise<ActionResult> {
  const parsed = clientRequestSchema.safeParse(rawData)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Neplatná data.' }

  const project = await getProjectByToken(token)
  if (!project) return { success: false, error: 'Projekt nenalezen.' }
  const { id: projectId } = project

  if (await isRateLimited('client_requests', projectId, 30, 5)) {
    return { success: false, error: 'Poslali jste hodně požadavků v krátkém čase. Zkuste to prosím později.' }
  }

  const projectRows = await sql`
    SELECT client_name, description, focus FROM projects WHERE id = ${projectId} LIMIT 1
  `
  const info = projectRows[0] as { client_name: string; description: string | null; focus: string | null } | undefined
  if (!info) return { success: false, error: 'Projekt nenalezen.' }

  let requestId: string
  try {
    const inserted = await sql`
      INSERT INTO client_requests (project_id, source, raw_text)
      VALUES (${projectId}, ${parsed.data.source}, ${parsed.data.text})
      RETURNING id
    `
    requestId = (inserted[0] as { id: string }).id
  } catch (err) {
    console.error('[ClientRequest] DB chyba při INSERT:', err)
    return { success: false, error: 'Chyba serveru. Zkuste to prosím znovu.' }
  }

  revalidatePath('/dashboard/pozadavky')

  void createNotification({
    type: 'client_request_received',
    title: `Nový požadavek od klienta — ${info.client_name}`,
    body: parsed.data.text.slice(0, 200),
    link: '/dashboard/pozadavky',
  })

  // Shrnutí od AI běží až po odpovědi klientovi a jeho selhání nic neruší:
  // požadavek je uložený a v adminu čitelný i bez něj.
  after(async () => {
    const ai = await summarizeClientRequest({
      text: parsed.data.text,
      clientName: info.client_name,
      description: info.description,
      focus: info.focus,
    })
    try {
      if (ai.data) {
        await sql`
          UPDATE client_requests
          SET ai_status = 'ready', ai_kind = ${ai.data.kind}, ai_summary = ${ai.data.summary},
              ai_prompt = ${ai.data.prompt}, ai_unclear = ${ai.data.unclear}
          WHERE id = ${requestId}
        `
      } else {
        await sql`UPDATE client_requests SET ai_status = 'failed' WHERE id = ${requestId}`
      }
    } catch (err) {
      console.error('[ClientRequest] uložení shrnutí selhalo:', err)
    }

    const to = adminEmail()
    if (to) {
      await sendBrandedEmail({
        to,
        subject: `Nový požadavek od klienta – ${info.client_name}`,
        heading: 'Nový požadavek od klienta',
        intro: `Klient ${info.client_name} poslal požadavek přes klientský portál. Zadání pro Claude Code najdete v administraci.`,
        fields: [
          { label: 'Klient', value: info.client_name },
          ...(ai.data
            ? [
                { label: 'Druh', value: REQUEST_KIND_LABELS[ai.data.kind] },
                { label: 'Shrnutí', value: ai.data.summary },
              ]
            : [{ label: 'Text klienta', value: parsed.data.text }]),
        ],
        ctas: [{ label: 'Otevřít požadavky', href: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/pozadavky` }],
      })
    }
  })

  return { success: true }
}
