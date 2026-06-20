'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { feedbackSchema, bookingSchema, surveySchema, type SurveyInput } from '@/lib/feedback-schema'
import { sendBrandedEmail } from '@/lib/email'
import { SURVEY_CATEGORIES } from '@/lib/types'

type ActionResult = { success: boolean; error?: string }

async function getProjectIdByToken(token: string): Promise<string | null> {
  const rows = await sql`SELECT id FROM projects WHERE public_token = ${token} LIMIT 1`
  return (rows[0] as { id: string } | undefined)?.id ?? null
}

// Throttle abuse of public, unauthenticated endpoints (token-only protection).
async function isRateLimited(
  table: 'client_feedback' | 'consultation_slots',
  projectId: string,
  windowMinutes: number,
  maxCount: number,
): Promise<boolean> {
  const rows = table === 'client_feedback'
    ? await sql`SELECT count(*) FROM client_feedback WHERE project_id = ${projectId} AND created_at > now() - interval '1 minute' * ${windowMinutes}`
    : await sql`SELECT count(*) FROM consultation_slots WHERE project_id = ${projectId} AND created_at > now() - interval '1 minute' * ${windowMinutes}`
  return parseInt((rows[0] as { count: string }).count, 10) >= maxCount
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function submitFeedback(
  token: string,
  rawData: { nps: number; content?: string },
): Promise<ActionResult> {
  const parsed = feedbackSchema.safeParse(rawData)
  if (!parsed.success) return { success: false, error: 'Neplatná data hodnocení.' }

  const projectId = await getProjectIdByToken(token)
  if (!projectId) return { success: false, error: 'Projekt nenalezen.' }

  if (await isRateLimited('client_feedback', projectId, 10, 3)) {
    return { success: false, error: 'Příliš mnoho hodnocení v krátkém čase. Zkuste to prosím později.' }
  }

  const projectRows = await sql`SELECT client_name FROM projects WHERE id = ${projectId} LIMIT 1`
  const clientName = (projectRows[0] as { client_name: string } | undefined)?.client_name ?? 'Neznámý klient'

  await sql`
    INSERT INTO client_feedback (project_id, nps, content)
    VALUES (${projectId}, ${parsed.data.nps}, ${parsed.data.content ?? null})
  `

  revalidatePath(`/dashboard/${projectId}`)

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    await sendBrandedEmail({
      to: adminEmail,
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

  const projectId = await getProjectIdByToken(token)
  if (!projectId) return { success: false, error: 'Projekt nenalezen.' }

  if (await isRateLimited('consultation_slots', projectId, 30, 3)) {
    return { success: false, error: 'Příliš mnoho rezervací v krátkém čase. Zkuste to prosím později.' }
  }

  const effectiveChannel = parsed.data.channel

  const meetingLink = generateMeetingLink(parsed.data.channel, scheduledDate)

  // consultation_slots and calendar_events (admin blocks, vizeon.cz bookings) live in
  // separate tables, so a single DB constraint can't span both — check here too.
  const overlapping = await sql`
    SELECT 1 FROM calendar_events
    WHERE starts_at <= ${scheduledDate.toISOString()}
      AND ends_at > ${scheduledDate.toISOString()}
    LIMIT 1
  `
  if (overlapping.length) {
    return { success: false, error: 'Tento termín je již obsazen. Vyberte prosím jiný.' }
  }

  try {
    await sql`
      INSERT INTO consultation_slots (project_id, scheduled_at, channel, client_wish, meeting_link, client_email)
      VALUES (${projectId}, ${scheduledDate.toISOString()}, ${effectiveChannel}, ${parsed.data.clientWish}, ${meetingLink}, ${parsed.data.clientEmail})
    `
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('unique') || (err as { code?: string })?.code === '23505') {
      return { success: false, error: 'Tento termín je již obsazen. Vyberte prosím jiný.' }
    }
    console.error('[Booking] DB chyba při INSERT:', err)
    return { success: false, error: 'Chyba serveru. Zkuste to prosím znovu.' }
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const formattedTime = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(scheduledDate)
  const channelName = parsed.data.channel === 'other'
    ? (parsed.data.channelOtherText ?? 'Jiné')
    : (CHANNEL_LABEL[parsed.data.channel] ?? parsed.data.channel)
  const fields = [
    { label: 'Datum a čas', value: formattedTime },
    { label: 'Komunikační kanál', value: channelName },
  ]

  if (adminEmail) {
    await sendBrandedEmail({
      to: adminEmail,
      subject: 'Nová rezervace konzultace – ZakazIQ',
      heading: 'Nová rezervace konzultace',
      intro: 'S vaší rezervací počítám a na konzultaci se důkladně připravuji. Níže najdete vše potřebné.',
      fields: [...fields, { label: 'Přání klienta', value: parsed.data.clientWish }],
      ctas: [{ label: 'Připojit se ke konzultaci', href: meetingLink }],
    })
  }

  if (parsed.data.clientEmail) {
    await sendBrandedEmail({
      to: parsed.data.clientEmail,
      subject: 'Potvrzení rezervace konzultace – ZakazIQ',
      heading: 'Vaše konzultace byla potvrzena',
      intro: 'S vaší rezervací počítám a na konzultaci se důkladně připravuji.',
      fields: [...fields, { label: 'Vaše přání', value: parsed.data.clientWish }],
      ctas: [{ label: 'Připojit se ke konzultaci', href: meetingLink }],
    })
  }

  return { success: true }
}

// ─── Satisfaction survey (Hodnocení) ────────────────────────────────────────────

export async function submitSurvey(
  token: string,
  rawData: Partial<SurveyInput>,
): Promise<ActionResult> {
  const parsed = surveySchema.safeParse(rawData)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Neplatná data.' }

  const projectRows = await sql`
    SELECT id, title, client_name FROM completed_projects WHERE survey_token = ${token} LIMIT 1
  `
  const cp = projectRows[0] as { id: string; title: string; client_name: string | null } | undefined
  if (!cp) return { success: false, error: 'Dotazník nenalezen.' }

  // Jeden dotazník na zakázku — existence zároveň slouží jako rate limit
  const existing = await sql`SELECT 1 FROM project_surveys WHERE completed_project_id = ${cp.id} LIMIT 1`
  if (existing.length) return { success: false, error: 'Tento dotazník již byl vyplněn. Děkujeme!' }

  const d = parsed.data
  await sql`
    INSERT INTO project_surveys (
      completed_project_id, rating_cooperation, rating_speed, rating_design,
      rating_functionality, rating_reliability, rating_flexibility, reference_text, consent
    )
    VALUES (
      ${cp.id}, ${d.rating_cooperation}, ${d.rating_speed}, ${d.rating_design},
      ${d.rating_functionality}, ${d.rating_reliability}, ${d.rating_flexibility},
      ${d.reference_text?.trim() || null}, ${d.consent}
    )
  `

  revalidatePath('/dashboard/hodnoceni')

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    await sendBrandedEmail({
      to: adminEmail,
      subject: `Nový vyplněný dotazník – ${cp.client_name ?? cp.title}`,
      heading: 'Nový vyplněný dotazník spokojenosti',
      intro: `Klient ${cp.client_name ?? cp.title} právě vyplnil dotazník spokojenosti k projektu „${cp.title}".`,
      fields: [
        ...SURVEY_CATEGORIES.map(c => ({ label: c.label, value: `${d[c.key]} / 5` })),
        ...(d.reference_text?.trim() ? [{ label: 'Reference', value: d.reference_text.trim() }] : []),
      ],
    })
  }

  return { success: true }
}
