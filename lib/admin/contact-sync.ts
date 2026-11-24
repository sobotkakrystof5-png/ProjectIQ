import 'server-only'
import { adminDb, type AdminQuery, type AdminRow } from '@/lib/admin/db'
import { ensureContact } from '@/lib/admin/contacts'
import { planReminders } from '@/lib/admin/meeting-reminders'
import { ACCEPTED_STATUSES } from '@/lib/admin/outreach-crm-view'
import { normalizeEmail, normalizePhone } from '@/lib/contacts/normalize'

/**
 * Jeden klient, jedny údaje (R-141).
 *
 * E-mail a telefon klienta jsou na víc místech: kontakt (`contacts`), Hovory
 * (`client_leads`), zakázka (`projects`), budoucí schůzka
 * (`calendar_events.invite_to`, `meeting_phone`) a firma od AI asistenta
 * (`outreach_leads`). **Pravdu drží kontakt** a tenhle modul ji propisuje dál.
 *
 * Jedno pravidlo pro všechny směry: nová hodnota nahradí **prázdné místo nebo
 * starou hodnotu**. Jinou hodnotu, kterou tam někdo napsal ručně, nechá být —
 * kancelářský e-mail v jedné zakázce tak nepřepíše osobní e-mail v Hovorech.
 *
 *  - Kryštof upraví kontakt → `propagateContact(id, staréÚdaje)`.
 *  - Údaj přijde odjinud (Growth OS, Hovory, okno schůzky) →
 *    `absorbIntoContact(id, nové, coSmíNahradit)`, který zapíše do kontaktu
 *    a pak propíše dál.
 *  - Firma od asistenta: `syncOutreachContact` ji s kontaktem spojí a vezme
 *    si od ní, co kontaktu chybí. Zobrazení firmy pak čte údaje z kontaktu
 *    (`outreachContactOverlay`), takže snímek z Growth OS ruční opravu nepřebije.
 *
 * Doklady (faktury, předávací dokumenty) se nemění: nesou údaje z doby vystavení.
 * Propisování nikdy neshodí hlavní akci — chybějící tabulka nebo sloupec
 * (testovací databáze, neaplikovaná migrace) se přeskočí.
 */

export type ContactValues = { email: string | null; phone: string | null }

const MISSING_SCHEMA = new Set(['42P01', '42703', '42883'])

export function isMissingSchema(err: unknown): boolean {
  return MISSING_SCHEMA.has((err as { code?: string })?.code ?? '')
}

/** Dávka, která snese chybějící tabulku nebo sloupec. Jiná chyba projde. */
async function batchSchemaTolerant(queries: AdminQuery[]): Promise<AdminRow[][]> {
  if (queries.length === 0) return []
  try {
    return await adminDb.batch(queries)
  } catch (err) {
    if (!isMissingSchema(err)) throw err
    const out: AdminRow[][] = []
    for (const query of queries) {
      try {
        out.push((await adminDb.batch([query]))[0])
      } catch (e) {
        if (!isMissingSchema(e)) throw e
        out.push([])
      }
    }
    return out
  }
}

/** Kořen kontaktu: sloučený kontakt vede na ten, do kterého patří (řetěz je plochý, R-095). */
const ROOT = `(SELECT coalesce(r.merged_into, r.id) FROM contacts r WHERE r.id = $1::uuid)`
/** Rodina kontaktu: kořen a všechno, co je do něj sloučené. */
const FAMILY = `(SELECT f.id FROM contacts f WHERE f.id = ${ROOT} OR f.merged_into = ${ROOT})`

/** Posledních devět číslic — stejný telefon zapsaný jinak („777 123 456" × „+420777123456"). */
const DIGITS = (expr: string) => `right(regexp_replace(coalesce(${expr}, ''), '\\D', '', 'g'), 9)`

/** Dá se tenhle telefon dát do schůzky? (CHECK z migrace 128 je o číslici přísnější než u kontaktu.) */
const MEETING_PHONE = /^\+[1-9][0-9]{7,14}$/

type ContactRow = { id: string; email: string | null; phone: string | null }

async function loadRoot(contactId: string): Promise<ContactRow | null> {
  const [rows] = await batchSchemaTolerant([
    { text: `SELECT id::text AS id, email, phone FROM contacts WHERE id = ${ROOT}`, params: [contactId] },
  ])
  const row = rows?.[0]
  return row ? { id: String(row.id), email: (row.email as string | null) ?? null, phone: (row.phone as string | null) ?? null } : null
}

/**
 * Propíše údaje kontaktu do Hovorů, zakázek a budoucích schůzek.
 * `previous` = co měl kontakt dřív: řádky s touhle hodnotou se přepíšou,
 * prázdné se doplní, jiné zůstanou. U schůzek se přepočítají připomínky
 * (přibyl telefon = přibyde SMS).
 */
export async function propagateContact(contactId: string, previous: ContactValues = { email: null, phone: null }): Promise<void> {
  const contact = await loadRoot(contactId)
  if (!contact) return
  const oldEmail = normalizeEmail(previous.email)
  const oldPhone = previous.phone?.trim() || null

  const queries: AdminQuery[] = []
  const meetingQueries: number[] = []

  if (contact.email) {
    const params = [contact.id, contact.email, oldEmail]
    const replaceable = (col: string) =>
      `(nullif(btrim(${col}), '') IS NULL OR ($3::text IS NOT NULL AND lower(btrim(${col})) = lower($3::text)))
       AND lower(coalesce(btrim(${col}), '')) <> lower($2::text)`
    queries.push(
      { text: `UPDATE client_leads SET email = $2 WHERE contact_id IN ${FAMILY} AND ${replaceable('email')}`, params },
      { text: `UPDATE projects SET client_email = $2 WHERE contact_id IN ${FAMILY} AND ${replaceable('client_email')}`, params },
    )
    // Pozvánku na budoucí schůzku nikdo nezakládá — jen se přesměruje ze staré adresy na novou.
    if (oldEmail) {
      meetingQueries.push(queries.length)
      queries.push({
        text: `UPDATE calendar_events e SET invite_to = $2
                WHERE e.starts_at > now() AND lower(e.invite_to) = lower($3::text) AND lower(e.invite_to) <> lower($2::text)
                  AND e.lead_id IN (SELECT l.id FROM client_leads l WHERE l.contact_id IN ${FAMILY})
                RETURNING e.id::text AS id`,
        params,
      })
      meetingQueries.push(queries.length)
      queries.push({
        text: `UPDATE calendar_events e SET invite_to = $2
                WHERE e.starts_at > now() AND lower(e.invite_to) = lower($3::text) AND lower(e.invite_to) <> lower($2::text)
                  AND e.outreach_lead_id IN (SELECT o.id FROM outreach_leads o WHERE o.contact_id IN ${FAMILY})
                RETURNING e.id::text AS id`,
        params,
      })
    }
  }

  if (contact.phone) {
    const params = [contact.id, contact.phone, oldPhone]
    const replaceable = (col: string) =>
      `(nullif(btrim(${col}), '') IS NULL OR ($3::text IS NOT NULL AND ${DIGITS(col)} = ${DIGITS('$3::text')}))
       AND ${DIGITS(col)} <> ${DIGITS('$2::text')}`
    queries.push(
      { text: `UPDATE client_leads SET phone = $2 WHERE contact_id IN ${FAMILY} AND ${replaceable('phone')}`, params },
      { text: `UPDATE projects SET client_phone = $2 WHERE contact_id IN ${FAMILY} AND ${replaceable('client_phone')}`, params },
    )
    // Budoucí schůzka s Meetem: chybějící telefon se doplní (pak dorazí i SMS), starý se vymění.
    if (MEETING_PHONE.test(contact.phone)) {
      const meetingPhone = `e.starts_at > now() AND e.meet_url IS NOT NULL
                  AND (e.meeting_phone IS NULL OR ($3::text IS NOT NULL AND e.meeting_phone = $3::text))
                  AND e.meeting_phone IS DISTINCT FROM $2::text`
      meetingQueries.push(queries.length)
      queries.push({
        text: `UPDATE calendar_events e SET meeting_phone = $2
                WHERE ${meetingPhone}
                  AND e.lead_id IN (SELECT l.id FROM client_leads l WHERE l.contact_id IN ${FAMILY})
                RETURNING e.id::text AS id`,
        params,
      })
      meetingQueries.push(queries.length)
      queries.push({
        text: `UPDATE calendar_events e SET meeting_phone = $2
                WHERE ${meetingPhone}
                  AND e.outreach_lead_id IN (SELECT o.id FROM outreach_leads o WHERE o.contact_id IN ${FAMILY})
                RETURNING e.id::text AS id`,
        params,
      })
    }
  }

  const results = await batchSchemaTolerant(queries)
  const events = new Set<string>()
  for (const i of meetingQueries) for (const row of results[i] ?? []) events.add(String(row.id))
  for (const id of events) await planReminders(id)
}

/**
 * Údaj odjinud (Growth OS, Hovory, okno schůzky) zapíše do kontaktu — jen
 * na prázdné místo, nebo místo hodnoty `replaceable` (co ten zdroj poslal
 * minule). Telefon nebo e-mail, který už má jiný kontakt, se nezapíše: to je
 * duplicita a řeší se sloučením v Kontaktech, ne přepsáním. Pak propíše dál.
 */
export async function absorbIntoContact(
  contactId: string,
  incoming: ContactValues,
  replaceable: ContactValues = { email: null, phone: null },
): Promise<void> {
  const contact = await loadRoot(contactId)
  if (!contact) return
  const email = normalizeEmail(incoming.email)
  const phone = normalizePhone(incoming.phone)
  const oldEmail = normalizeEmail(replaceable.email)
  const oldPhone = normalizePhone(replaceable.phone)

  const takeEmail =
    email !== null &&
    email !== (contact.email?.toLowerCase() ?? null) &&
    (contact.email === null || (oldEmail !== null && contact.email.toLowerCase() === oldEmail))
  const takePhone =
    phone !== null && phone !== contact.phone && (contact.phone === null || (oldPhone !== null && contact.phone === oldPhone))

  if (takeEmail || takePhone) {
    try {
      await adminDb.batch([
        {
          text: `UPDATE contacts c
                    SET email = CASE WHEN $2::text IS NOT NULL AND NOT EXISTS (
                                  SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id
                                     AND d.email IS NOT NULL AND lower(d.email) = lower($2::text))
                                THEN $2 ELSE c.email END,
                        phone = CASE WHEN $3::text IS NOT NULL AND NOT EXISTS (
                                  SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id AND d.phone = $3::text)
                                THEN $3 ELSE c.phone END
                  WHERE c.id = $1::uuid`,
          params: [contact.id, takeEmail ? email : null, takePhone ? phone : null],
        },
      ])
    } catch (err) {
      // Souběh s jiným zápisem téhož e-mailu nebo telefonu: duplicitu vyřeší sloučení.
      if ((err as { code?: string })?.code !== '23505') throw err
      console.error('[kontakty] údaj už mezitím dostal jiný kontakt, nepřepisuji', contact.id)
    }
  }
  await propagateContact(contact.id, { email: contact.email, phone: contact.phone })
}

// ─── Firma od AI asistenta ───────────────────────────────────────────────────

/** Řekla firma ano ukázce (nebo ji Kryštof převzal)? Od té chvíle je to klient a patří do Kontaktů. */
export function outreachHasConsent(f: { status: string; demoUrl?: string | null; clientLeadId?: string | null }): boolean {
  return (ACCEPTED_STATUSES as readonly string[]).includes(f.status) || Boolean(f.demoUrl) || Boolean(f.clientLeadId)
}

type OutreachRow = {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  contact_id: string | null
  lead_contact_id: string | null
}

/**
 * Spojí firmu od asistenta s kontaktem (najde podle telefonu a e-mailu, jinak
 * založí) a vezme si od ní, co kontaktu chybí. `previous` = co Growth OS
 * poslal minule: když ho kontakt pořád drží, nová hodnota ho nahradí; když
 * ho Kryštof mezitím opravil, zůstane jeho. Vrací id kontaktu.
 */
export async function syncOutreachContact(outreachId: string, previous: ContactValues = { email: null, phone: null }): Promise<string | null> {
  const [rows] = await batchSchemaTolerant([
    {
      text: `SELECT l.id::text AS id, l.company_name, l.contact_name, l.phone, l.email,
                    nullif(to_jsonb(l) ->> 'contact_id', '') AS contact_id,
                    (SELECT cl.contact_id::text FROM client_leads cl WHERE cl.id = l.client_lead_id) AS lead_contact_id
               FROM outreach_leads l WHERE l.id = $1::uuid`,
      params: [outreachId],
    },
  ])
  const firm = (rows?.[0] as unknown as OutreachRow | undefined) ?? null
  if (!firm) return null

  let contactId = firm.contact_id ?? firm.lead_contact_id
  // Jméno firmy nikoho neurčí: bez telefonu a e-mailu by vznikl kontakt k ničemu.
  if (!contactId && !firm.phone && !firm.email) return null
  if (!contactId) {
    contactId = await ensureContact({
      name: firm.contact_name ?? firm.company_name,
      company: firm.company_name,
      email: firm.email,
      phone: firm.phone,
      source: 'growth-os',
    })
  }
  if (!contactId) return null
  await linkOutreachContact(firm.id, contactId)
  await absorbIntoContact(contactId, { email: firm.email, phone: firm.phone }, previous)
  return contactId
}

/** Vazba firmy na kontakt. Bez migrace 130 se přeskočí (firma se spojí přes Hovory). */
export async function linkOutreachContact(outreachId: string, contactId: string): Promise<void> {
  await batchSchemaTolerant([
    {
      text: `UPDATE outreach_leads SET contact_id = ${ROOT.replace('$1', '$2')}
              WHERE id = $1::uuid AND contact_id IS DISTINCT FROM ${ROOT.replace('$1', '$2')}`,
      params: [outreachId, contactId],
    },
  ])
}

export type OutreachContact = { contactId: string; email: string | null; phone: string | null }

/**
 * Údaje z kontaktu pro firmy od asistenta: přednost před tím, co poslal Growth OS.
 * Firma bez kontaktu ve výsledku chybí. Bez tabulky kontaktů prázdná mapa.
 */
export async function outreachContactOverlay(
  firms: { id: string; contactId: string | null; clientLeadId: string | null }[],
): Promise<Map<string, OutreachContact>> {
  const linked = firms.filter((f) => f.contactId || f.clientLeadId)
  const out = new Map<string, OutreachContact>()
  if (linked.length === 0) return out
  const [rows] = await batchSchemaTolerant([
    {
      text: `SELECT x.oid::text AS oid, c.id::text AS contact_id, c.email, c.phone
               FROM jsonb_to_recordset($1::jsonb) AS x(oid uuid, cid uuid, lid uuid)
               LEFT JOIN client_leads cl ON x.cid IS NULL AND cl.id = x.lid
               JOIN contacts s ON s.id = coalesce(x.cid, cl.contact_id)
               JOIN contacts c ON c.id = coalesce(s.merged_into, s.id)`,
      params: [JSON.stringify(linked.map((f) => ({ oid: f.id, cid: f.contactId, lid: f.clientLeadId })))],
    },
  ])
  for (const r of rows ?? []) {
    out.set(String(r.oid), {
      contactId: String(r.contact_id),
      email: (r.email as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
    })
  }
  return out
}
