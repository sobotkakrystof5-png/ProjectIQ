import 'server-only'
import { adminDb, q, type AdminQuery } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { loadOutreachSource, markOutreachHandled, takeoverNote } from '@/lib/admin/outreach'

/**
 * Komu se e-mail z okna „Poslat e-mail" posílá (R-132).
 *
 * Okno je v Hovorech, na kartě kontaktu a u firem od AI asistenta, takže
 * adresát může být kontakt z Hovorů (`lead`), kontakt z `contacts` (`contact`)
 * nebo firma z Growth OS (`outreach`). **Adresu vždy čte server z databáze**
 * podle id — z prohlížeče nikdy nepřichází.
 *
 * Schůzka potřebuje kontakt v Hovorech (tam se zapisuje termín a odtud ho
 * kalendář kreslí). Nemá-li adresát žádný, založí se (`ensureLeadFor`) a při
 * selhání schůzky zase zahodí, ať po neúspěšném pokusu v Hovorech nic nezbyde.
 */

export type MailTargetKind = 'lead' | 'contact' | 'outreach'
export type MailTargetRef = { kind: MailTargetKind; id: string }

export type MailTarget = MailTargetRef & {
  email: string | null
  /** Název do Hovorů: firma, jinak jméno. */
  company: string
  contactName: string | null
  phone: string | null
  /** Kontakt v Hovorech, který k adresátovi patří; `null` = žádný zatím není. */
  leadId: string | null
}

type TargetRow = {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  lead_id: string | null
}

export async function loadMailTarget(ref: MailTargetRef): Promise<MailTarget | null> {
  let row: TargetRow | undefined
  if (ref.kind === 'lead') {
    row = (
      await adminDb<TargetRow>`
        SELECT id::text AS id, company_name, contact_name, phone, email, id::text AS lead_id
          FROM client_leads WHERE id = ${ref.id}
      `
    )[0]
  } else if (ref.kind === 'contact') {
    // Kontakt může mít v Hovorech víc řádků; bere se nejnovější ještě otevřený.
    // Hotový nebo ztracený by schůzka přepsala, a to by byl cizí příběh.
    row = (
      await adminDb<TargetRow>`
        SELECT c.id::text AS id, coalesce(nullif(btrim(c.company), ''), c.display_name) AS company_name,
               CASE WHEN nullif(btrim(c.company), '') IS NULL THEN NULL ELSE c.display_name END AS contact_name,
               c.phone, c.email,
               (SELECT l.id::text FROM client_leads l
                 WHERE l.contact_id = c.id AND l.lead_status NOT IN ('converted', 'lost')
                 ORDER BY l.created_at DESC LIMIT 1) AS lead_id
          FROM contacts c WHERE c.id = ${ref.id}
      `
    )[0]
  } else {
    const source = await loadOutreachSource(ref.id)
    if (!source) return null
    row = {
      id: ref.id,
      company_name: source.company_name,
      contact_name: source.contact_name,
      phone: source.phone,
      email: source.email,
      lead_id: source.client_lead_id,
    }
  }
  if (!row) return null
  return {
    kind: ref.kind,
    id: ref.id,
    email: row.email?.trim() || null,
    company: row.company_name,
    contactName: row.contact_name,
    phone: row.phone,
    leadId: row.lead_id,
  }
}

/**
 * Kontakt v Hovorech pro schůzku. Existující se jen vrátí; jinak se založí
 * s příští akcí „Domluvit schůzku" (termín na něj zapíše `sendLeadMeetingEmail`).
 */
export async function ensureLeadFor(target: MailTarget): Promise<{ leadId: string; created: boolean }> {
  if (target.leadId) return { leadId: target.leadId, created: false }

  let contactId: string | null = target.kind === 'contact' ? target.id : null
  let notes: string | null = null
  if (target.kind === 'outreach') {
    const source = await loadOutreachSource(target.id)
    contactId = await ensureContact({
      name: target.contactName ?? target.company,
      company: target.company,
      email: target.email,
      phone: target.phone,
      source: 'growth-os',
    })
    notes = source ? takeoverNote(source) || null : null
  }

  const rows = await adminDb<{ id: string }>`
    INSERT INTO client_leads (company_name, contact_name, phone, email, lead_status, next_action, next_action_type, notes, contact_id)
    VALUES (${target.company}, ${target.contactName}, ${target.phone}, ${target.email}, 'cold',
            'Domluvit schůzku', 'call', ${notes}, ${contactId})
    RETURNING id::text AS id
  `
  const leadId = rows[0]?.id
  if (!leadId) throw new Error('Kontakt v Hovorech se nepodařilo založit.')
  return { leadId, created: true }
}

/** Po neúspěšné schůzce zahodí kontakt, který se kvůli ní založil. */
export async function discardCreatedLead(leadId: string): Promise<void> {
  await adminDb`DELETE FROM client_leads WHERE id = ${leadId}`
}

/** Po úspěšné schůzce: firma od asistenta je převzatá a už se jí nevolá. */
export async function finishMeetingFor(target: MailTarget, leadId: string): Promise<void> {
  if (target.kind === 'outreach') await markOutreachHandled(target.id, 'prevzato', leadId)
}

/**
 * Záznam o odeslaném e-mailu. Jen u kontaktu, který v Hovorech je — tam se
 * ukáže „Odesláno" a poznámka. Kontakt ani firma bez řádku v Hovorech žádnou
 * historii nemají a nic se kvůli e-mailu nezakládá.
 */
export async function recordMailSent(target: MailTarget, subject: string): Promise<void> {
  if (!target.leadId) return
  const writes: AdminQuery[] = [
    q`UPDATE client_leads SET portfolio_sent_at = now() WHERE id = ${target.leadId}`,
    q`INSERT INTO lead_notes (lead_id, content) VALUES (${target.leadId}, ${`Odeslán e-mail „${subject}“.`})`,
  ]
  await adminDb.batch(writes)
}
