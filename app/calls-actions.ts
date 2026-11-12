'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminDb, q } from '@/lib/admin/db'
import { loadLeadNotes } from '@/lib/admin/leads'
import { ensureContact } from '@/lib/admin/contacts'
import { sendPlainEmail } from '@/lib/email'
import { notifyClientOfProjectChange } from '@/app/actions'
import { buildPortfolioEmailBody, PORTFOLIO_EMAIL_SUBJECT } from '@/lib/portfolio-email'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { ClientLead, LeadNote, LeadStatus, LeadActionType } from '@/lib/types'

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

/** Celé poznámky jednoho kontaktu — až když si ho někdo rozklikne (AD07). */
export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const session = await getServerSession(authOptions)
  if (!session) return []
  return loadLeadNotes(leadId)
}

export async function addLeadNote(leadId: string, content: string) {
  await requireAuth()
  if (!content.trim()) throw new Error('Poznámka nemůže být prázdná.')
  const rows = await sql`
    INSERT INTO lead_notes (lead_id, content)
    VALUES (${leadId}, ${content.trim()})
    RETURNING id, created_at
  `
  revalidatePath('/dashboard/calls')
  return rows[0] as { id: string; created_at: string }
}

export async function deleteLeadNote(id: string) {
  await requireAuth()
  await sql`DELETE FROM lead_notes WHERE id = ${id}`
  revalidatePath('/dashboard/calls')
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

  // Jeden člověk = jeden kontakt (AD09). Zakázka se na něj napojí a text
  // v ní je jen snímek dokladu; `ensureContact` nikdy nespadne na duplicitě.
  const contactId = await ensureContact({
    name: lead.contact_name,
    company: lead.company_name,
    email: lead.email,
    phone: lead.phone,
    source: 'lead',
  })

  // Jeden atomický příkaz: založení projektu (new_project) čte data jen z
  // updated_lead, takže k INSERTu dojde pouze tehdy, když UPDATE skutečně
  // zasáhl řádek (lead existuje a ještě není 'converted'). Zdvojený klik
  // nebo retry po chybě tak nikdy nezaloží duplicitní projekt.
  //
  // Co se do zakázky převádí (AD09): kontakt, oba kontaktní údaje, popis,
  // cena — a navíc **název firmy** (dřív zmizel, když se klient jmenoval
  // jménem člověka) a **poznámky z hovorů**, které zůstávaly u leadu, takže
  // v zakázce nebylo vidět, co se s klientem domluvilo.
  const projectRows = await sql`
    WITH updated_lead AS (
      UPDATE client_leads
      SET lead_status = 'converted',
          contact_id = COALESCE(contact_id, ${contactId}),
          updated_at = now()
      WHERE id = ${leadId} AND lead_status <> 'converted'
      RETURNING company_name, contact_name, email, phone, notes, estimated_value, calendar_event_id
    ),
    new_project AS (
      INSERT INTO projects (client_name, client_email, client_phone, description, notes, status, progress, price, paid, contact_id)
      SELECT COALESCE(contact_name, company_name), email, phone, notes,
             CASE WHEN contact_name IS NOT NULL AND company_name IS NOT NULL THEN 'Firma: ' || company_name END,
             'new', 0, estimated_value, false, ${contactId}
      FROM updated_lead
      RETURNING id, public_token
    ),
    copied_notes AS (
      INSERT INTO project_notes (project_id, content, created_at)
      SELECT np.id, ln.content, ln.created_at
      FROM new_project np
      JOIN lead_notes ln ON ln.lead_id = ${leadId}
      RETURNING id
    )
    SELECT id, public_token, (SELECT calendar_event_id FROM updated_lead) AS calendar_event_id
    FROM new_project
  `
  if (!projectRows.length) throw new Error('Kontakt je již převeden na zakázku.')
  const created = projectRows[0] as { id: string; public_token: string; calendar_event_id: string | null }

  // Termín z Hovorů se naváže na zakázku, aby v kalendáři nebyla událost
  // „bez zakázky". Je to vlastní příkaz: `calendar_events` má překryvový
  // guard (migrace 044), který u starých dat může zaprotestovat i při
  // obyčejném zápisu — a to nesmí shodit převod na zakázku.
  if (created.calendar_event_id) {
    try {
      await sql`
        UPDATE calendar_events SET project_id = ${created.id}
        WHERE id = ${created.calendar_event_id} AND project_id IS NULL
      `
    } catch (e) {
      console.error('convertLeadToProject: termín se k zakázce nepodařilo navázat', e)
    }
  }

  // Stejné uvítací upozornění jako u založení zakázky přes /dashboard/new —
  // klient by o novém projektu založeném přes Hovory jinak nikdy nezjistil.
  // Jde mimo akci (AD08): odpověď nečeká na Gmail SMTP.
  after(() =>
    notifyClientOfProjectChange(
      { client_name: clientName, client_email: lead.email, status: 'new', progress: 0, project_url: null, public_token: created.public_token },
      'created',
    ),
  )

  revalidatePath('/dashboard/calls')
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/kontakty')
  // Dřív to vyhodilo na Dnes, takže se nová zakázka musela hledat.
  redirect(`/dashboard/${created.id}`)
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
  const ok = await sendPlainEmail({ to: lead.email, subject: PORTFOLIO_EMAIL_SUBJECT, text: body })
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

  const ok = await sendPlainEmail({ to: lead.email, subject: opts.subject, text: opts.body })
  if (!ok) return { error: 'Nepodařilo se odeslat email. Zkontrolujte prosím emailové nastavení.' }

  await markPortfolioSent(leadId)
  return { success: true }
}
