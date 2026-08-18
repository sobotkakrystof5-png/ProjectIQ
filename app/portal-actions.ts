'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { feedbackSchema, bookingSchema, surveySchema, type SurveyInput } from '@/lib/feedback-schema'
import { sendBrandedEmail } from '@/lib/email'
import { SURVEY_CATEGORIES } from '@/lib/types'
import { createNotification } from '@/lib/notifications'
import { projectPath, toBusiness, adminEmailFor, type Business } from '@/lib/business'

type ActionResult = { success: boolean; error?: string }

// Klientský portál je společný pro VIZEON i ALTENO, ale odkaz v notifikaci
// i revalidace musí mířit do sekce, kam zakázka patří.
async function getProjectByToken(token: string): Promise<{ id: string; business: Business } | null> {
  const rows = await sql`SELECT id, business FROM projects WHERE public_token = ${token} LIMIT 1`
  const row = rows[0] as { id: string; business: string | null } | undefined
  return row ? { id: row.id, business: toBusiness(row.business) } : null
}

// Throttle abuse of public, unauthenticated endpoints (token-only protection).
// One query per table, kept as tagged templates (never raw/interpolated SQL) —
// add a line here for any new public-action table instead of hardcoding a
// two-way ternary.
const RATE_LIMIT_QUERIES: Record<
  'client_feedback' | 'consultation_slots' | 'project_surveys',
  (id: string, windowMinutes: number) => Promise<{ count: string }[]>
> = {
  client_feedback: (id, windowMinutes) =>
    sql`SELECT count(*) FROM client_feedback WHERE project_id = ${id} AND created_at > now() - interval '1 minute' * ${windowMinutes}` as unknown as Promise<{ count: string }[]>,
  consultation_slots: (id, windowMinutes) =>
    sql`SELECT count(*) FROM consultation_slots WHERE project_id = ${id} AND created_at > now() - interval '1 minute' * ${windowMinutes}` as unknown as Promise<{ count: string }[]>,
  project_surveys: (id, windowMinutes) =>
    sql`SELECT count(*) FROM project_surveys WHERE completed_project_id = ${id} AND created_at > now() - interval '1 minute' * ${windowMinutes}` as unknown as Promise<{ count: string }[]>,
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
  const { id: projectId, business } = project

  if (await isRateLimited('client_feedback', projectId, 10, 3)) {
    return { success: false, error: 'Příliš mnoho hodnocení v krátkém čase. Zkuste to prosím později.' }
  }

  const projectRows = await sql`SELECT client_name FROM projects WHERE id = ${projectId} LIMIT 1`
  const clientName = (projectRows[0] as { client_name: string } | undefined)?.client_name ?? 'Neznámý klient'

  await sql`
    INSERT INTO client_feedback (project_id, nps, content)
    VALUES (${projectId}, ${parsed.data.nps}, ${parsed.data.content ?? null})
  `

  revalidatePath(projectPath(business, projectId))

  void createNotification({
    type: 'feedback_submitted',
    title: `Nové hodnocení od klienta — ${clientName}`,
    body: `NPS: ${parsed.data.nps}/10${parsed.data.content ? ' · ' + parsed.data.content : ''}`,
    link: projectPath(business, projectId),
  })

  const adminEmail = adminEmailFor(business)
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
      business,
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

  const project = await getProjectByToken(token)
  if (!project) return { success: false, error: 'Projekt nenalezen.' }
  const { id: projectId, business } = project

  if (await isRateLimited('consultation_slots', projectId, 30, 3)) {
    return { success: false, error: 'Příliš mnoho rezervací v krátkém čase. Zkuste to prosím později.' }
  }

  const effectiveChannel = parsed.data.channel

  const meetingLink = generateMeetingLink(parsed.data.channel, scheduledDate)

  try {
    await sql`
      INSERT INTO consultation_slots (project_id, scheduled_at, channel, channel_other_text, client_wish, meeting_link, client_email)
      VALUES (${projectId}, ${scheduledDate.toISOString()}, ${effectiveChannel}, ${parsed.data.channelOtherText ?? null}, ${parsed.data.clientWish}, ${meetingLink}, ${parsed.data.clientEmail})
    `
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === '23505' || code === '23P01') {
      return { success: false, error: 'Tento termín je již obsazen. Vyberte prosím jiný.' }
    }
    console.error('[Booking] DB chyba při INSERT:', err)
    return { success: false, error: 'Chyba serveru. Zkuste to prosím znovu.' }
  }

  const adminEmail = adminEmailFor(business)
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
      business,
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
      business,
    })
  }

  void createNotification({
    type: 'consultation_booked',
    title: 'Nová rezervace konzultace',
    body: `${formattedTime} · ${channelName} — ${parsed.data.clientWish}`,
    link: projectPath(business, projectId),
  })

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

  if (await isRateLimited('project_surveys', cp.id, 10, 3)) {
    return { success: false, error: 'Příliš mnoho pokusů v krátkém čase. Zkuste to prosím později.' }
  }

  const d = parsed.data
  try {
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
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === '23505') {
      return { success: false, error: 'Tento dotazník již byl vyplněn. Děkujeme!' }
    }
    console.error('[Survey] DB chyba při INSERT:', err)
    return { success: false, error: 'Chyba serveru. Zkuste to prosím znovu.' }
  }

  revalidatePath('/dashboard/hodnoceni')

  void createNotification({
    type: 'survey_submitted',
    title: `Nový dotazník spokojenosti`,
    body: `${cp.client_name ?? cp.title}`,
    link: `/dashboard/hodnoceni`,
  })

  // Dotazník spokojenosti existuje jen u "Dokončené" — funkce dostupná
  // výhradně ve VIZEON sekci (viz CLAUDE.md), completed_projects nemá sloupec business.
  const adminEmail = adminEmailFor('vizeon')
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
      business: 'vizeon',
    })
  }

  return { success: true }
}
