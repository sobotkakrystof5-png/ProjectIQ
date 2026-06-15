'use server'

import { sql } from '@/lib/db'
import { feedbackSchema, bookingSchema } from '@/lib/feedback-schema'

type ActionResult = { success: boolean; error?: string }

async function getProjectIdByToken(token: string): Promise<string | null> {
  const rows = await sql`SELECT id FROM projects WHERE public_token = ${token} LIMIT 1`
  return (rows[0] as { id: string } | undefined)?.id ?? null
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

  await sql`
    INSERT INTO client_feedback (project_id, nps, content)
    VALUES (${projectId}, ${parsed.data.nps}, ${parsed.data.content ?? null})
  `
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

function buildAdminEmail(formattedTime: string, channel: string, clientWish: string, meetingLink: string): string {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1b3868 0%,#23478b 100%);padding:32px 40px;">
    <p style="margin:0 0 6px;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">ZakazIQ</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">Nová rezervace konzultace</h1>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      S vaší rezervací počítám a na konzultaci se důkladně připravuji. Níže najdete vše potřebné.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e0e7ff;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Datum a čas</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">${formattedTime}</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Komunikační kanál</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">${channel}</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Přání klienta</p>
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.5;">${clientWish.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </td></tr></table>
    <a href="${meetingLink}" style="display:inline-block;background:linear-gradient(135deg,#1b3868,#23478b);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;">
      Připojit se ke konzultaci →
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Vygenerováno automaticky — ZakazIQ</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

function buildClientEmail(formattedTime: string, channel: string, clientWish: string, meetingLink: string): string {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1b3868 0%,#23478b 100%);padding:32px 40px;">
    <p style="margin:0 0 6px;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">ZakazIQ</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">Vaše konzultace byla potvrzena</h1>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      S vaší rezervací počítám a na konzultaci se důkladně připravuji.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e0e7ff;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Datum a čas</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">${formattedTime}</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Komunikační kanál</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">${channel}</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Vaše přání</p>
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.5;">${clientWish.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </td></tr></table>
    <a href="${meetingLink}" style="display:inline-block;background:linear-gradient(135deg,#1b3868,#23478b);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;">
      Připojit se ke konzultaci →
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Vygenerováno automaticky — ZakazIQ</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
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

  const effectiveChannel = parsed.data.channel

  const meetingLink = generateMeetingLink(parsed.data.channel, scheduledDate)

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

  // Send confirmation emails — failure must not affect DB commit
  try {
    const gmailUser = process.env.GMAIL_USER
    const gmailPassword = process.env.GMAIL_APP_PASSWORD
    const adminEmail = process.env.ADMIN_EMAIL
    if (gmailUser && gmailPassword && adminEmail) {
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPassword.replace(/\s/g, '') },
      })
      const formattedTime = new Intl.DateTimeFormat('cs-CZ', {
        timeZone: 'Europe/Prague',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(scheduledDate)
      const channelName = parsed.data.channel === 'other'
        ? (parsed.data.channelOtherText ?? 'Jiné')
        : (CHANNEL_LABEL[parsed.data.channel] ?? parsed.data.channel)

      await transporter.sendMail({
        from: `ZakazIQ <${gmailUser}>`,
        to: adminEmail,
        subject: 'Nová rezervace konzultace – ZakazIQ',
        html: buildAdminEmail(formattedTime, channelName, parsed.data.clientWish, meetingLink),
      })

      if (parsed.data.clientEmail) {
        await transporter.sendMail({
          from: `ZakazIQ <${gmailUser}>`,
          to: parsed.data.clientEmail,
          subject: 'Potvrzení rezervace konzultace – ZakazIQ',
          html: buildClientEmail(formattedTime, channelName, parsed.data.clientWish, meetingLink),
        })
      }
    }
  } catch (emailErr) {
    console.error('[Email] Selhání odesílání emailu — konzultace uložena v DB:', emailErr)
  }

  return { success: true }
}
