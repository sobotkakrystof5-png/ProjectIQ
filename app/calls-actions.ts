'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getAdminSession, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { adminDb, q, type AdminRow } from '@/lib/admin/db'
import { loadLeadNotes } from '@/lib/admin/leads'
import { ensureContact } from '@/lib/admin/contacts'
import { absorbIntoContact } from '@/lib/admin/contact-sync'
import { notifyClientOfProjectChange } from '@/app/actions'
import { pragueDateTimeToISO } from '@/lib/prague-time'
import { deleteGoogleEvent } from '@/lib/admin/google/calendar'
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
  const session = await getAdminSession()
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

/**
 * Kontakt v Kontaktech k řádku Hovorů (R-141): najde podle telefonu a e-mailu,
 * jinak založí. Bez telefonu i e-mailu žádný — samotné jméno nikoho neurčí.
 * Selhání uložení hovoru nezruší.
 */
async function contactFor(payload: Pick<LeadPayload, 'company_name' | 'contact_name' | 'phone' | 'email'>): Promise<string | null> {
  if (!payload.phone?.trim() && !payload.email?.trim()) return null
  try {
    return await ensureContact({
      name: payload.contact_name ?? payload.company_name,
      company: payload.contact_name ? payload.company_name : null,
      email: payload.email,
      phone: payload.phone,
      source: 'lead',
    })
  } catch (err) {
    console.error('[Hovory] kontakt se nepodařilo napojit', (err as Error).message)
    return null
  }
}

export async function createLead(payload: LeadPayload) {
  await requireAuth()
  const contactId = await contactFor(payload)
  const rows = await sql`
    INSERT INTO client_leads (
      company_name, contact_name, phone, email,
      lead_status, next_action, next_action_date, next_action_time, next_action_type,
      notes, estimated_value, call_answered, contact_id
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
      ${payload.call_answered},
      ${contactId}
    )
    RETURNING id, created_at
  `
  revalidatePath('/dashboard/calls')
  return rows[0] as { id: string; created_at: string }
}

export async function updateLead(id: string, payload: LeadPayload) {
  await requireAuth()

  // Dvojice kalendář ↔ hovor (051) se dřív rozpadla: tenhle UPDATE přepsal
  // čas u kontaktu a termín v kalendáři zůstal na starém. `admin_lead_reschedule`
  // (migrace 105) přepíše obě strany v jedné transakci; dávka je jedno kolo
  // po síti (R-092).
  // Rozpad času dělá `lib/prague-time.ts`, ne SQL (R-093).
  const instant = pragueDateTimeToISO(payload.next_action_date, payload.next_action_time)
  // `old` vidí řádek před úpravou — podle něj se změna e-mailu a telefonu propíše do kontaktu (R-141).
  const update = q`
    WITH old AS (SELECT id, email, phone, contact_id FROM client_leads WHERE id = ${id})
    UPDATE client_leads cl SET
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
    FROM old
    WHERE cl.id = old.id
    RETURNING cl.reminder_day_before_sent, cl.reminder_2h_before_sent, cl.updated_at,
              old.email AS old_email, old.phone AS old_phone, old.contact_id::text AS contact_id
  `

  let rows: AdminRow[]
  try {
    const results = await adminDb.batch(
      instant === null ? [update] : [update, q`SELECT admin_lead_reschedule(${id}, ${instant}::timestamptz) AS event_id`],
    )
    rows = results[0]
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === '23P01') {
      throw new Error('Tento termín se překrývá s jinou událostí v kalendáři. Vyberte prosím jiný čas.')
    }
    // Databáze bez migrace 105 (`42883` = funkce neexistuje) nesmí shodit
    // uložení kontaktu. Dávka je transakce, takže by se jinak nezapsalo nic
    // a úprava hovoru by na produkci přestala fungovat v okně mezi nasazením
    // větve a aplikací migrace. Termín v kalendáři se pak jen neposune —
    // přesně jak se admin choval před AD10. Stejná úvaha jako u rezervace
    // z portálu v `app/portal-actions.ts`.
    if (code !== '42883' || instant === null) throw err
    console.error('[Hovory] migrace 105 chybí, termín v kalendáři se neposunul')
    rows = (await adminDb.batch([update]))[0]
  }

  const saved = rows[0]
  if (saved) await syncLeadContact(id, payload, saved)

  revalidatePath('/dashboard/calls')
  // Termín se mohl posunout i v kalendáři.
  if (instant !== null) revalidatePath('/dashboard/calendar')
  return {
    reminder_day_before_sent: saved?.reminder_day_before_sent,
    reminder_2h_before_sent: saved?.reminder_2h_before_sent,
    updated_at: saved?.updated_at,
  } as unknown as Pick<ClientLead, 'reminder_day_before_sent' | 'reminder_2h_before_sent' | 'updated_at'>
}

/**
 * Po úpravě v Hovorech (R-141): řádek bez kontaktu se napojí, a když se
 * změnil e-mail nebo telefon, kontakt si ho vezme — pokud tam měl prázdno,
 * nebo právě tu starou hodnotu. Pak se propíše do zakázek a schůzek.
 * Selhání uložení hovoru nezruší.
 */
async function syncLeadContact(id: string, payload: LeadPayload, saved: AdminRow): Promise<void> {
  try {
    const oldEmail = (saved.old_email as string | null) ?? null
    const oldPhone = (saved.old_phone as string | null) ?? null
    let contactId = (saved.contact_id as string | null) ?? null
    if (!contactId) {
      contactId = await contactFor(payload)
      if (contactId) await adminDb`UPDATE client_leads SET contact_id = ${contactId} WHERE id = ${id} AND contact_id IS NULL`
    }
    if (!contactId) return
    const changed = (oldEmail ?? '') !== (payload.email ?? '') || (oldPhone ?? '') !== (payload.phone ?? '')
    if (!changed) return
    await absorbIntoContact(contactId, { email: payload.email, phone: payload.phone }, { email: oldEmail, phone: oldPhone })
    revalidatePath('/dashboard/kontakty')
  } catch (err) {
    console.error('[Hovory] propsání e-mailu a telefonu do kontaktu selhalo', (err as Error).message)
  }
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

/**
 * Smaže kontakt z Hovorů i s jeho termínem v kalendáři — stejně jako mazání
 * v kalendáři (`deleteCalendarEvent`): jeden příkaz a schůzka zmizí i z Google
 * Kalendáře. Zrcadlová událost konzultace z klientského prostoru se tudy
 * nemaže, patří rezervaci (`consultation_slots`). Audit 2026-11-24, #9.
 */
export async function deleteLead(id: string) {
  await requireAuth()
  const rows = (await sql`
    WITH ld AS (
      DELETE FROM client_leads WHERE id = ${id}
      RETURNING calendar_event_id
    ),
    ev AS (
      DELETE FROM calendar_events
      WHERE id IN (SELECT calendar_event_id FROM ld)
        -- Přes to_jsonb, ať mazání běží i bez migrace 105.
        AND (to_jsonb(calendar_events) ->> 'consultation_slot_id') IS NULL
      RETURNING id::text AS id, to_jsonb(calendar_events) ->> 'google_event_id' AS google_event_id
    )
    SELECT ev.id, ev.google_event_id FROM ev
  `) as { id: string; google_event_id: string | null }[]
  const event = rows[0]
  if (event) {
    revalidatePath('/dashboard/calendar')
    // Jako v kalendáři: Google až po chvíli a jen když událost nikdo nevrátil.
    if (event.google_event_id) {
      const googleId = event.google_event_id
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10_000))
        const back = (await sql`SELECT 1 FROM calendar_events WHERE id = ${event.id}`) as unknown[]
        if (back.length > 0) return
        await deleteGoogleEvent(googleId).catch((err) =>
          console.error('[calls] Smazání schůzky v Googlu selhalo:', (err as Error).message),
        )
      })
    }
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
