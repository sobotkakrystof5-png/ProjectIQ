import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { sendBrandedEmail } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import {
  generateRecurringCashFlowTransactionsInternal,
  generateRecurringCostTransactionsInternal,
} from '@/lib/recurring-transactions'
import { verifyCronSecret } from '@/lib/api-auth'
import { CHANNEL_LABELS, type ConsultationChannel } from '@/lib/types'
import { adminEmail } from '@/lib/lead-origins'

export const dynamic = 'force-dynamic'

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
  client_name: string
  scheduled_at: string
  channel: ConsultationChannel
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
  const to = adminEmail()
  const when = new Date(slot.scheduled_at)
  const formattedTime = formatPrague(when)
  const channelName = CHANNEL_LABELS[slot.channel]
  const link = slot.meeting_link && slot.meeting_link !== '#' ? slot.meeting_link : null
  const isDayBefore = type === 'day_before'

  const sends: Promise<unknown>[] = []

  // Email klientovi
  if (slot.client_email) {
    sends.push(sendBrandedEmail({
      to: slot.client_email,
      subject: isDayBefore
        ? `Připomínka zítřejší konzultace – ZakazIQ`
        : `Konzultace začíná za 2 hodiny – ZakazIQ`,
      heading: isDayBefore ? 'Zítra máte konzultaci' : 'Za 2 hodiny začínáme',
      intro: isDayBefore
        ? 'Jen krátká připomínka — zítra se uvidíme. Níže najdete všechny potřebné informace.'
        : 'Vaše konzultace začíná za přibližně 2 hodiny. Vše máme připraveno.',
      fields: [
        { label: 'Datum a čas', value: formattedTime },
        { label: 'Způsob spojení', value: channelName },
      ],
      ...(link ? { ctas: [{ label: 'Připojit se ke konzultaci', href: link }] } : {}),
    }))
  }

  // Email adminovi
  if (to) {
    sends.push(sendBrandedEmail({
      to,
      subject: isDayBefore
        ? `Zítra máš hovor s ${slot.client_name} – ZakazIQ`
        : `Za 2 hodiny: hovor s ${slot.client_name} – ZakazIQ`,
      heading: isDayBefore ? `Zítra máš konzultaci` : `Za 2 hodiny začínáš`,
      intro: isDayBefore
        ? `Připomínám ti zítřejší konzultaci s klientem.`
        : `Za přibližně 2 hodiny začíná konzultace.`,
      fields: [
        { label: 'Klient', value: slot.client_name },
        { label: 'Datum a čas', value: formattedTime },
        { label: 'Způsob spojení', value: channelName },
      ],
      ...(link ? { ctas: [{ label: 'Připojit se', href: link }] } : {}),
    }))
  }

  await Promise.all(sends)
}

// client_leads ("Hovory") je funkce jen ve VIZEON sekci — viz AGENTS.md.
async function sendLeadReminder(lead: LeadRow, type: 'day_before' | '2h_before') {
  const to = adminEmail()
  if (!to) return

  const when = new Date(lead.action_at)
  const formattedTime = formatPrague(when)
  const actionLabel = lead.next_action_type ? (LEAD_ACTION_LABEL[lead.next_action_type] ?? lead.next_action_type) : 'Akce'
  const contactLabel = [lead.contact_name, lead.company_name].filter(Boolean).join(' / ')
  const isDayBefore = type === 'day_before'

  await sendBrandedEmail({
    to,
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
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Konzultační sloty (pro klienty) + lead akce ──────────────────────────
  // 4 nezávislé atomické UPDATE...RETURNING — spouštíme paralelně, ne sekvenčně.
  // Řádek se "claimne" (sent = true) ve stejném dotazu, který ho vybere, takže
  // souběžná/duplicitní volání cronu (externí cron-job.org) nemůžou stejný
  // řádek vyzvednout dvakrát — stejný princip jako UNIQUE constraint u rezervací.
  const [dayBeforeSlots, twoHourSlots, leadDayBefore, leadTwoHour] = await Promise.all([
    // Day-before: scheduled 23–25 h from now (target 24h, ±1h for hourly cron).
    sql`
      UPDATE consultation_slots cs
      SET reminder_day_before_sent = true
      FROM projects p
      WHERE cs.project_id = p.id
        AND cs.reminder_day_before_sent = false
        AND cs.scheduled_at BETWEEN now() + interval '23 hours'
                                 AND now() + interval '25 hours'
      RETURNING cs.id, cs.client_email, p.client_name, cs.scheduled_at, cs.channel, cs.meeting_link
    `,
    // 2h-before: scheduled 1–3 h from now (target 2h, ±1h for hourly cron).
    sql`
      UPDATE consultation_slots cs
      SET reminder_2h_before_sent = true
      FROM projects p
      WHERE cs.project_id = p.id
        AND cs.reminder_2h_before_sent = false
        AND cs.scheduled_at BETWEEN now() + interval '1 hour'
                                 AND now() + interval '3 hours'
      RETURNING cs.id, cs.client_email, p.client_name, cs.scheduled_at, cs.channel, cs.meeting_link
    `,
    // Lead akce (připomínky pro admina) — kombinujeme date + time do timestamptz
    // přes Prague timezone. Okno ±1h kolem 24h / 2h, shodné s konzultacemi.
    sql`
      UPDATE client_leads
      SET reminder_day_before_sent = true
      WHERE reminder_day_before_sent = false
        AND next_action_date IS NOT NULL
        AND next_action_time IS NOT NULL
        AND (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague'
            BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
      RETURNING id, company_name, contact_name, next_action, next_action_type,
                (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague' AS action_at
    `,
    sql`
      UPDATE client_leads
      SET reminder_2h_before_sent = true
      WHERE reminder_2h_before_sent = false
        AND next_action_date IS NOT NULL
        AND next_action_time IS NOT NULL
        AND (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague'
            BETWEEN now() + interval '1 hour' AND now() + interval '3 hours'
      RETURNING id, company_name, contact_name, next_action, next_action_type,
                (next_action_date + next_action_time) AT TIME ZONE 'Europe/Prague' AS action_at
    `,
  ]) as [SlotRow[], SlotRow[], LeadRow[], LeadRow[]]

  // Opakované transakce — fixní náklady i cash-flow šablony. Oba generátory
  // jsou idempotentní (`ON CONFLICT DO NOTHING`), takže se smí pustit znovu.
  // Cash-flow se sem přidalo v AD08: dřív ho zakládal **render** stránky
  // Finance, takže vznikaly při prohlížení a vůbec ne, když se tam nikdo
  // nepodíval. Chyba jednoho generátoru nesmí zastavit připomínky.
  await Promise.all([
    generateRecurringCostTransactionsInternal().catch(() => {}),
    generateRecurringCashFlowTransactionsInternal().catch(() => {}),
  ])

  const results = { day_before: 0, two_hours: 0, lead_day_before: 0, lead_two_hours: 0, errors: 0 }

  const dayBeforeResults = await Promise.allSettled(dayBeforeSlots.map(async (slot) => {
    await sendConsultationReminder(slot, 'day_before')
    void createNotification({
      type: 'reminder_upcoming',
      title: `Připomínka: zítřejší konzultace`,
      body: `${formatPrague(new Date(slot.scheduled_at))} · ${CHANNEL_LABELS[slot.channel]}`,
    })
  }))
  results.day_before = dayBeforeResults.filter(r => r.status === 'fulfilled').length
  results.errors += dayBeforeResults.filter(r => r.status === 'rejected').length

  const twoHourResults = await Promise.allSettled(twoHourSlots.map(async (slot) => {
    await sendConsultationReminder(slot, '2h_before')
    void createNotification({
      type: 'reminder_upcoming',
      title: `Za 2 hodiny začíná konzultace`,
      body: `${formatPrague(new Date(slot.scheduled_at))} · ${CHANNEL_LABELS[slot.channel]}`,
    })
  }))
  results.two_hours = twoHourResults.filter(r => r.status === 'fulfilled').length
  results.errors += twoHourResults.filter(r => r.status === 'rejected').length

  const leadDayBeforeResults = await Promise.allSettled(leadDayBefore.map(async (lead) => {
    await sendLeadReminder(lead, 'day_before')
    void createNotification({
      type: 'reminder_upcoming',
      title: `Připomínka: zítřejší akce s klientem`,
      body: `${lead.contact_name ?? lead.company_name} · ${LEAD_ACTION_LABEL[lead.next_action_type ?? ''] ?? lead.next_action_type ?? 'Akce'} · ${formatPrague(new Date(lead.action_at))}`,
      link: `/dashboard/calls`,
    })
  }))
  results.lead_day_before = leadDayBeforeResults.filter(r => r.status === 'fulfilled').length
  results.errors += leadDayBeforeResults.filter(r => r.status === 'rejected').length

  const leadTwoHourResults = await Promise.allSettled(leadTwoHour.map(async (lead) => {
    await sendLeadReminder(lead, '2h_before')
    void createNotification({
      type: 'reminder_upcoming',
      title: `Za 2 hodiny: akce s klientem`,
      body: `${lead.contact_name ?? lead.company_name} · ${LEAD_ACTION_LABEL[lead.next_action_type ?? ''] ?? lead.next_action_type ?? 'Akce'} · ${formatPrague(new Date(lead.action_at))}`,
      link: `/dashboard/calls`,
    })
  }))
  results.lead_two_hours = leadTwoHourResults.filter(r => r.status === 'fulfilled').length
  results.errors += leadTwoHourResults.filter(r => r.status === 'rejected').length

  return NextResponse.json({ ok: true, ...results })
}
