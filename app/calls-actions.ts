'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { sendPlainEmail } from '@/lib/email'
import { notifyClientOfProjectChange } from '@/app/actions'
import { buildPortfolioEmailBody, PORTFOLIO_EMAIL_SUBJECT } from '@/lib/portfolio-email'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { ClientLead, LeadStatus, LeadActionType } from '@/lib/types'

export type LeadPayload = {
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  lead_status: LeadStatus
  next_action: string | null
  next_action_date: string | null
  next_action_time: string | null
  next_action_type: LeadActionType | null
  notes: string | null
  estimated_value: number | null
  call_answered: boolean | null
}

export async function getLeads() {
  const session = await getServerSession(authOptions)
  if (!session) return []
  return await sql`
    SELECT *, next_action_date::text AS next_action_date FROM client_leads ORDER BY created_at DESC
  `
}

export async function createLead(payload: LeadPayload) {
  await requireAuth()
  const rows = await sql`
    INSERT INTO client_leads (
      company_name, contact_name, phone, email,
      lead_status, next_action, next_action_date, next_action_time, next_action_type,
      notes, estimated_value, call_answered
    ) VALUES (
      ${payload.company_name},
      ${payload.contact_name},
      ${payload.phone},
      ${payload.email},
      ${payload.lead_status},
      ${payload.next_action},
      ${payload.next_action_date},
      ${payload.next_action_time},
      ${payload.next_action_type},
      ${payload.notes},
      ${payload.estimated_value},
      ${payload.call_answered}
    )
    RETURNING id, created_at
  `
  revalidatePath('/dashboard/calls')
  return rows[0] as { id: string; created_at: string }
}

export async function updateLead(id: string, payload: LeadPayload) {
  await requireAuth()
  const rows = await sql`
    UPDATE client_leads SET
      company_name = ${payload.company_name},
      contact_name = ${payload.contact_name},
      phone = ${payload.phone},
      email = ${payload.email},
      lead_status = ${payload.lead_status},
      next_action = ${payload.next_action},
      next_action_date = ${payload.next_action_date},
      next_action_time = ${payload.next_action_time},
      next_action_type = ${payload.next_action_type},
      notes = ${payload.notes},
      estimated_value = ${payload.estimated_value},
      call_answered = ${payload.call_answered},
      reminder_day_before_sent = CASE
        WHEN next_action_date IS DISTINCT FROM ${payload.next_action_date}
          OR next_action_time IS DISTINCT FROM ${payload.next_action_time}
        THEN false ELSE reminder_day_before_sent END,
      reminder_2h_before_sent = CASE
        WHEN next_action_date IS DISTINCT FROM ${payload.next_action_date}
          OR next_action_time IS DISTINCT FROM ${payload.next_action_time}
        THEN false ELSE reminder_2h_before_sent END,
      updated_at = now()
    WHERE id = ${id}
    RETURNING reminder_day_before_sent, reminder_2h_before_sent, updated_at
  `
  revalidatePath('/dashboard/calls')
  return rows[0] as Pick<ClientLead, 'reminder_day_before_sent' | 'reminder_2h_before_sent' | 'updated_at'>
}

export async function setCallAnswered(id: string, answered: boolean | null) {
  await requireAuth()
  await sql`UPDATE client_leads SET call_answered = ${answered}, updated_at = now() WHERE id = ${id}`
  revalidatePath('/dashboard/calls')
}

export async function moveLeadToWaiting(id: string) {
  await requireAuth()
  await sql`UPDATE client_leads SET lead_status = 'waiting', updated_at = now() WHERE id = ${id}`
  revalidatePath('/dashboard/calls')
}

export async function moveLeadFromWaiting(id: string) {
  await requireAuth()
  await sql`UPDATE client_leads SET lead_status = 'cold', updated_at = now() WHERE id = ${id}`
  revalidatePath('/dashboard/calls')
}

export async function deleteLead(id: string) {
  await requireAuth()
  const rows = await sql`SELECT calendar_event_id FROM client_leads WHERE id = ${id}`
  const calendarEventId = (rows[0] as { calendar_event_id: string | null } | undefined)?.calendar_event_id
  await sql`DELETE FROM client_leads WHERE id = ${id}`
  if (calendarEventId) {
    await sql`DELETE FROM calendar_events WHERE id = ${calendarEventId}`
    revalidatePath('/dashboard/calendar')
  }
  revalidatePath('/dashboard/calls')
}

export async function convertLeadToProject(leadId: string) {
  await requireAuth()
  const rows = await sql`SELECT * FROM client_leads WHERE id = ${leadId}`
  const lead = rows[0] as unknown as ClientLead
  if (!lead) throw new Error('Kontakt nenalezen')

  const clientName = lead.contact_name || lead.company_name

  // Jeden atomický příkaz: založení projektu (new_project) čte data jen z
  // updated_lead, takže k INSERTu dojde pouze tehdy, když UPDATE skutečně
  // zasáhl řádek (lead existuje a ještě není 'converted'). Zdvojený klik
  // nebo retry po chybě tak nikdy nezaloží duplicitní projekt.
  const projectRows = await sql`
    WITH updated_lead AS (
      UPDATE client_leads SET lead_status = 'converted', updated_at = now()
      WHERE id = ${leadId} AND lead_status <> 'converted'
      RETURNING company_name, contact_name, email, phone, notes, estimated_value
    ),
    new_project AS (
      INSERT INTO projects (client_name, client_email, client_phone, description, status, progress, price, paid)
      SELECT COALESCE(contact_name, company_name), email, phone, notes, 'new', 0, estimated_value, false
      FROM updated_lead
      RETURNING public_token
    )
    SELECT public_token FROM new_project
  `
  if (!projectRows.length) throw new Error('Kontakt je již převeden na zakázku.')
  const publicToken = (projectRows[0] as { public_token: string }).public_token

  // Stejné uvítací upozornění jako u založení zakázky přes /dashboard/new —
  // klient by o novém projektu založeném přes Hovory jinak nikdy nezjistil.
  await notifyClientOfProjectChange(
    { client_name: clientName, client_email: lead.email, status: 'new', progress: 0, project_url: null, public_token: publicToken },
    'created',
    'vizeon'
  )

  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

async function markPortfolioSent(leadId: string) {
  await sql`UPDATE client_leads SET portfolio_sent_at = now() WHERE id = ${leadId}`
  revalidatePath('/dashboard/calls')
}

export async function sendPortfolioEmail(leadId: string): Promise<{ success: true } | { error: string }> {
  await requireAuth()
  const rows = await sql`SELECT *, next_action_date::text AS next_action_date FROM client_leads WHERE id = ${leadId}`
  const lead = rows[0] as unknown as ClientLead
  if (!lead) return { error: 'Kontakt nenalezen.' }
  if (!lead.email) return { error: 'Kontakt nemá vyplněný email.' }
  if (!lead.next_action_date) return { error: 'Kontakt nemá vyplněné datum příštího hovoru.' }

  const body = buildPortfolioEmailBody({
    todayISO: getPragueTodayISO(),
    nextCallDateISO: lead.next_action_date,
  })
  const ok = await sendPlainEmail({ to: lead.email, subject: PORTFOLIO_EMAIL_SUBJECT, text: body, business: 'vizeon' })
  if (!ok) return { error: 'Nepodařilo se odeslat email. Zkontrolujte prosím emailové nastavení.' }

  await markPortfolioSent(leadId)
  return { success: true }
}

export async function sendCustomLeadEmail(
  leadId: string,
  opts: { subject: string; body: string }
): Promise<{ success: true } | { error: string }> {
  await requireAuth()
  const rows = await sql`SELECT email FROM client_leads WHERE id = ${leadId}`
  const lead = rows[0] as { email: string | null } | undefined
  if (!lead) return { error: 'Kontakt nenalezen.' }
  if (!lead.email) return { error: 'Kontakt nemá vyplněný email.' }
  if (!opts.subject.trim() || !opts.body.trim()) return { error: 'Předmět i text zprávy musí být vyplněné.' }

  const ok = await sendPlainEmail({ to: lead.email, subject: opts.subject, text: opts.body, business: 'vizeon' })
  if (!ok) return { error: 'Nepodařilo se odeslat email. Zkontrolujte prosím emailové nastavení.' }

  await markPortfolioSent(leadId)
  return { success: true }
}
