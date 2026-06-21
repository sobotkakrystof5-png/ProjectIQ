import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { sendBrandedEmail } from '@/lib/email'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  teams:    'Microsoft Teams',
  meet:     'Google Meet',
  phone:    'Telefon',
  other:    'Jiné',
}

const LEAD_ACTION_LABEL: Record<string, string> = {
  call:     'Telefonní hovor',
  meeting:  'Osobní setkání',
  email:    'Email',
  whatsapp: 'WhatsApp',
  online:   'Online schůzka',
  other:    'Jiné',
}

function formatPrague(date: Date): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

type SlotRow = {
  id: string
  client_email: string | null
  scheduled_at: string
  channel: string
  meeting_link: string | null
}

type LeadRow = {
  id: string
  company_name: string
  contact_name: string | null
  next_action: string | null
  next_action_type: string | null
  action_at: string
}

async function sendConsultationReminder(slot: SlotRow, type: 'day_before' | '2h_before') {
  if (!slot.client_email) return

  const when = new Date(slot.scheduled_at)
  const formattedTime = formatPrague(when)
  const channelName = CHANNEL_LABEL[slot.channel] ?? slot.channel
  const link = slot.meeting_link && slot.meeting_link !== '#' ? slot.meeting_link : null

  const isDayBefore = type === 'day_before'

  await sendBrandedEmail({
    to: slot.client_email,
    subject: isDayBefore
      ? `Připomínka zítřejší konzultace – ZakazIQ`
      : `Konzultace začíná za 2 hodiny – ZakazIQ`,
    heading: isDayBefore
      ? 'Zítra máte konzultaci'
      : 'Za 2 hodiny začínáme',
    intro: isDayBefore
      ? 'Jen krátká připomínka — zítra se uvidíme. Níže najdete všechny potřebné informace.'
      : 'Vaše konzultace začíná za přibližně 2 hodiny. Vše máme připraveno.',
    fields: [
      { label: 'Datum a čas', value: formattedTime },
      { label: 'Způsob spojení', value: channelName },
    ],
    ...(link
      ? { ctas: [{ label: 'Připojit se ke konzultaci', href: link }] }
      : {}),
  })
}

async function sendLeadReminder(lead: LeadRow, type: 'day_before' | '2h_before') {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) return

  const when = new Date(lead.action_at)
  const formattedTime = formatPrague(when)
  const actionLabel = lead.next_action_type ? (LEAD_ACTION_LABEL[lead.next_action_type] ?? lead.next_action_type) : 'Akce'
  const contactLabel = [lead.contact_name, lead.company_name].filter(Boolean).join(' / ')
  const isDayBefore = type === 'day_before'

  await sendBrandedEmail({
    to: adminEmail,
    subject: isDayBefore
      ? `Připomínka: zítřejší akce s klientem – ${lead.company_name}`
      : `Za 2 hodiny: ${actionLabel} s ${lead.company_name}`,
    heading: isDayBefore
      ? `Zítra máš akci s klientem`
      : `Za 2 hodiny začínáš`,
    intro: isDayBefore
      ? `Připomínám ti naplánovanou akci na zítra. Níže jsou detaily.`
      : `Zbývají přibližně 2 hodiny do naplánované akce.`,
    fields: [
      { label: 'Klient', value: contactLabel },
      { label: 'Typ akce', value: actionLabel },
      { label: 'Čas', value: formattedTime },
      ...(lead.next_action ? [{ label: 'Poznámka', value: lead.next_action }] : []),
    ],
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Konzultační sloty (pro klienty) ──────────────────────────────────────

  // Day-before: scheduled 23–25 h from now (target 24h, ±1h for hourly cron).
  const dayBeforeSlots = (await sql`
    SELECT id, client_email, scheduled_at, channel, meeting_link
    FROM consultation_slots
    WHERE reminder_day_before_sent = false
      AND client_email IS NOT NULL
      AND scheduled_at BETWEEN now() + interval '23 hours'
                           AND now() + interval '25 hours'
  `) as SlotRow[]

  // 2h-before: scheduled 1–3 h from now (target 2h, ±1h for hourly cron).
  const twoHourSlots = (await sql`
    SELECT id, client_email, scheduled_at, channel, meeting_link
    FROM consultation_slots
    WHERE reminder_2h_before_sent = false
      AND client_email IS NOT NULL
      AND scheduled_at BETWEEN now() + interval '1 hour'
                           AND now() + interval '3 hours'
  `) as SlotRow[]

  // ── Lead akce (připomínky pro admina) ────────────────────────────────────
  // Kombinujeme date + time do timestamptz přes Prague timezone.
  // Okno ±1h kolem 24h / 2h, shodné s konzultacemi.

  const leadDayBefore = (await sql`
    SELECT id, company_name, contact_name, next_action, next_action_type,
           (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague' AS action_at
    FROM client_leads
    WHERE reminder_day_before_sent = false
      AND next_action_date IS NOT NULL
      AND next_action_time IS NOT NULL
      AND (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague'
          BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
  `) as LeadRow[]

  const leadTwoHour = (await sql`
    SELECT id, company_name, contact_name, next_action, next_action_type,
           (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague' AS action_at
    FROM client_leads
    WHERE reminder_2h_before_sent = false
      AND next_action_date IS NOT NULL
      AND next_action_time IS NOT NULL
      AND (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague'
          BETWEEN now() + interval '1 hour' AND now() + interval '3 hours'
  `) as LeadRow[]

  const results = { day_before: 0, two_hours: 0, lead_day_before: 0, lead_two_hours: 0, errors: 0 }

  for (const slot of dayBeforeSlots) {
    try {
      await sendConsultationReminder(slot, 'day_before')
      await sql`UPDATE consultation_slots SET reminder_day_before_sent = true WHERE id = ${slot.id}`
      void createNotification({
        type: 'reminder_upcoming',
        title: `Připomínka: zítřejší konzultace`,
        body: `${formatPrague(new Date(slot.scheduled_at))} · ${CHANNEL_LABEL[slot.channel] ?? slot.channel}`,
      })
      results.day_before++
    } catch {
      results.errors++
    }
  }

  for (const slot of twoHourSlots) {
    try {
      await sendConsultationReminder(slot, '2h_before')
      await sql`UPDATE consultation_slots SET reminder_2h_before_sent = true WHERE id = ${slot.id}`
      void createNotification({
        type: 'reminder_upcoming',
        title: `Za 2 hodiny začíná konzultace`,
        body: `${formatPrague(new Date(slot.scheduled_at))} · ${CHANNEL_LABEL[slot.channel] ?? slot.channel}`,
      })
      results.two_hours++
    } catch {
      results.errors++
    }
  }

  for (const lead of leadDayBefore) {
    try {
      await sendLeadReminder(lead, 'day_before')
      await sql`UPDATE client_leads SET reminder_day_before_sent = true WHERE id = ${lead.id}`
      void createNotification({
        type: 'reminder_upcoming',
        title: `Připomínka: zítřejší akce s klientem`,
        body: `${lead.contact_name ?? lead.company_name} · ${LEAD_ACTION_LABEL[lead.next_action_type ?? ''] ?? lead.next_action_type ?? 'Akce'} · ${formatPrague(new Date(lead.action_at))}`,
        link: `/dashboard/calls`,
      })
      results.lead_day_before++
    } catch {
      results.errors++
    }
  }

  for (const lead of leadTwoHour) {
    try {
      await sendLeadReminder(lead, '2h_before')
      await sql`UPDATE client_leads SET reminder_2h_before_sent = true WHERE id = ${lead.id}`
      void createNotification({
        type: 'reminder_upcoming',
        title: `Za 2 hodiny: akce s klientem`,
        body: `${lead.contact_name ?? lead.company_name} · ${LEAD_ACTION_LABEL[lead.next_action_type ?? ''] ?? lead.next_action_type ?? 'Akce'} · ${formatPrague(new Date(lead.action_at))}`,
        link: `/dashboard/calls`,
      })
      results.lead_two_hours++
    } catch {
      results.errors++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
