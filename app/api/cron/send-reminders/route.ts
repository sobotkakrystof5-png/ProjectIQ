import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { sendBrandedEmail } from '@/lib/email'

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  teams:    'Microsoft Teams',
  meet:     'Google Meet',
  phone:    'Telefon',
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

async function sendReminder(slot: SlotRow, type: 'day_before' | '2h_before') {
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

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

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

  const results = { day_before: 0, two_hours: 0, errors: 0 }

  for (const slot of dayBeforeSlots) {
    try {
      await sendReminder(slot, 'day_before')
      await sql`UPDATE consultation_slots SET reminder_day_before_sent = true WHERE id = ${slot.id}`
      results.day_before++
    } catch {
      results.errors++
    }
  }

  for (const slot of twoHourSlots) {
    try {
      await sendReminder(slot, '2h_before')
      await sql`UPDATE consultation_slots SET reminder_2h_before_sent = true WHERE id = ${slot.id}`
      results.two_hours++
    } catch {
      results.errors++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
