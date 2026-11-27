import 'server-only'
import { adminDb, type AdminQuery, type AdminRow } from './db'
import { normalizeDic, normalizeEmail, normalizeIco, normalizePhone, trimOrNull } from '@/lib/contacts/normalize'
import type { TableParams } from '@/lib/admin-table'

/**
 * Kontakty `/dashboard/kontakty` (AD09).
 *
 * Jeden člověk = jeden řádek v `contacts`; textové sloupce v zakázkách,
 * hovorech a na fakturách zůstávají jako **snímek dokladu**. Pravidlo:
 * `contact_id` = kdo to je, text = co bylo tehdy napsáno.
 *
 * **Sloučení nic nepřepisuje.** Nastaví se `contacts.merged_into` a čtení
 * vede na cílový kontakt (`COALESCE(merged_into, id)`); „Zpět" je smazání té
 * jedné hodnoty. Proto se tu všude počítá s **rodinou** kontaktu: on sám plus
 * všechno, co je do něj sloučené.
 */

/** Povolené řazení: klíč v URL → sloupec (do SQL se z adresy nic nedostane). */
export const CONTACT_SORT = {
  jmeno: { sql: 'lower(btrim(c.display_name))', dir: 'asc' as const },
  firma: { sql: 'lower(btrim(c.company))', dir: 'asc' as const },
  telefon: { sql: 'c.phone', dir: 'asc' as const },
  email: { sql: 'lower(c.email)', dir: 'asc' as const },
  naposledy: { sql: 'c.last_seen_at', dir: 'desc' as const },
  pridano: { sql: 'c.created_at', dir: 'desc' as const },
}

export type ContactView = 'aktivni' | 'duplicity' | 'sloucene'

export type ContactRow = {
  id: string
  display_name: string
  company: string | null
  email: string | null
  phone: string | null
  ico: string | null
  dic: string | null
  /** Sídlo / fakturační adresa (R-153, migrace 140). */
  address: string | null
  note: string | null
  source: string
  last_seen_at: string | null
  created_at: string
  merged_into: string | null
  merged_into_name: string | null
  /** Kolikrát se kontakt objevuje; počítá se za celou rodinu. */
  zakazky: number
  hovory: number
  konzultace: number
  poptavky: number
}

export type ContactsScreen = {
  rows: ContactRow[]
  total: number
  counts: Record<ContactView, number>
}

/** Rodina kontaktu: on sám a všechno, co je do něj sloučené. */
const FAMILY = `
  LEFT JOIN LATERAL (
    SELECT array_append(coalesce(array_agg(m.id), '{}'::uuid[]), c.id) AS ids
    FROM contacts m WHERE m.merged_into = c.id
  ) fam ON true`

const OCCURRENCES = `
  LEFT JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM projects p           WHERE p.contact_id = ANY(fam.ids))::int AS zakazky,
      (SELECT count(*) FROM client_leads l       WHERE l.contact_id = ANY(fam.ids))::int AS hovory,
      (SELECT count(*) FROM consultation_slots s WHERE s.contact_id = ANY(fam.ids))::int AS konzultace,
      (SELECT count(*) FROM agent_leads a        WHERE a.contact_id = ANY(fam.ids))::int AS poptavky
  ) occ ON true`

const ROW_COLUMNS = `c.id::text, c.display_name, c.company, c.email, c.phone, c.ico, c.dic,
  to_jsonb(c) ->> 'address' AS address, c.note,
  c.source, c.last_seen_at, c.created_at, c.merged_into::text,
  t.display_name AS merged_into_name,
  occ.zakazky, occ.hovory, occ.konzultace, occ.poptavky`

const TARGET_JOIN = `LEFT JOIN contacts t ON t.id = c.merged_into`

/** Kontakt, který má jmenovce mezi nesloučenými — kandidát na sloučení. */
const DUPLICATE_WHERE = `EXISTS (
  SELECT 1 FROM contacts d
  WHERE d.merged_into IS NULL AND d.id <> c.id
    AND lower(btrim(d.display_name)) = lower(btrim(c.display_name))
)`

function viewWhere(view: ContactView): string {
  if (view === 'sloucene') return 'c.merged_into IS NOT NULL'
  if (view === 'duplicity') return `c.merged_into IS NULL AND ${DUPLICATE_WHERE}`
  return 'c.merged_into IS NULL'
}

/** Hledání: jméno, firma, e-mail a telefon (i jinak zapsaný). */
function searchClause(search: string | null, from: number): { sql: string; params: unknown[] } {
  if (search === null) return { sql: '', params: [] }
  const like = `%${search}%`
  const phone = normalizePhone(search)
  const digits = search.replace(/\D/g, '')
  const params: unknown[] = [like]
  let sql = ` AND (c.display_name ILIKE $${from} OR c.company ILIKE $${from} OR c.email ILIKE $${from}`
  if (phone !== null) {
    params.push(phone)
    sql += ` OR c.phone = $${from + params.length - 1}`
  }
  if (digits.length >= 4) {
    params.push(`%${digits}%`)
    sql += ` OR regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') LIKE $${from + params.length - 1}`
  }
  return { sql: sql + ')', params }
}

export async function loadContactsScreen(
  view: ContactView,
  search: string | null,
  params: TableParams,
): Promise<ContactsScreen> {
  const term = trimOrNull(search)
  const where = viewWhere(view)
  const filter = searchClause(term, 3)

  const page: AdminQuery = {
    text: `SELECT ${ROW_COLUMNS}
           FROM contacts c ${TARGET_JOIN} ${FAMILY} ${OCCURRENCES}
           WHERE ${where}${filter.sql}
           ${params.orderBy}
           LIMIT $1 OFFSET $2`,
    params: [params.limit, params.offset, ...filter.params],
  }

  // Počty u přepínače se počítají přes celý filtr, ne přes zobrazenou stránku.
  const countFilter = searchClause(term, 1)
  const counts: AdminQuery = {
    text: `SELECT
             count(*) FILTER (WHERE c.merged_into IS NULL)::int AS aktivni,
             count(*) FILTER (WHERE c.merged_into IS NULL AND ${DUPLICATE_WHERE})::int AS duplicity,
             count(*) FILTER (WHERE c.merged_into IS NOT NULL)::int AS sloucene
           FROM contacts c
           WHERE true${countFilter.sql}`,
    params: countFilter.params,
  }

  const [pageRows, countRows] = await adminDb.batch([page, counts])
  const c = countRows[0] ?? {}
  const byView: Record<ContactView, number> = {
    aktivni: Number(c.aktivni ?? 0),
    duplicity: Number(c.duplicity ?? 0),
    sloucene: Number(c.sloucene ?? 0),
  }

  return { rows: pageRows as unknown as ContactRow[], total: byView[view], counts: byView }
}

/** Jedno místo, kde se kontakt objevuje — s textem, který ten řádek nese. */
export type ContactOccurrence = {
  kind: 'zakazka' | 'hovor' | 'konzultace' | 'poptavka' | 'asistent'
  id: string
  title: string
  /** Jak je kontakt v tom řádku napsaný (jméno, e-mail, telefon). */
  written: string | null
  at: string | null
  href: string | null
}

export type ContactCandidate = {
  id: string
  display_name: string
  company: string | null
  email: string | null
  phone: string | null
  /** Proč je to kandidát: stejné jméno, firma nebo IČO. */
  reason: 'jmeno' | 'firma' | 'ico'
}

export type ContactDetail = {
  contact: ContactRow
  /** Kontakty sloučené do tohohle. */
  merged: { id: string; display_name: string; email: string | null; phone: string | null }[]
  occurrences: ContactOccurrence[]
  candidates: ContactCandidate[]
}

/** Strop na každý výpis v detailu — bez něj by karta rostla s historií. */
const DETAIL_LIMIT = 20

export async function loadContactDetail(id: string): Promise<ContactDetail | null> {
  const head: AdminQuery = {
    text: `SELECT ${ROW_COLUMNS}
           FROM contacts c ${TARGET_JOIN} ${FAMILY} ${OCCURRENCES}
           WHERE c.id = $1`,
    params: [id],
  }
  const merged: AdminQuery = {
    text: `SELECT id::text, display_name, email, phone FROM contacts
           WHERE merged_into = $1 ORDER BY display_name LIMIT $2`,
    params: [id, DETAIL_LIMIT],
  }
  // Rodina kontaktu: on sám a všechno, co je do něj sloučené.
  const family = `(SELECT f.id FROM contacts f WHERE f.id = $1 OR f.merged_into = $1)`
  const projects: AdminQuery = {
    text: `SELECT id::text, coalesce(nullif(btrim(description), ''), 'Zakázka') AS title,
                  client_name AS written, created_at AS at
           FROM projects WHERE contact_id IN ${family}
           ORDER BY created_at DESC LIMIT $2`,
    params: [id, DETAIL_LIMIT],
  }
  const leads: AdminQuery = {
    text: `SELECT id::text, company_name AS title, coalesce(contact_name, phone, email) AS written, created_at AS at
           FROM client_leads WHERE contact_id IN ${family}
           ORDER BY created_at DESC LIMIT $2`,
    params: [id, DETAIL_LIMIT],
  }
  const slots: AdminQuery = {
    text: `SELECT id::text, coalesce(channel, 'Konzultace') AS title, client_email AS written, scheduled_at AS at
           FROM consultation_slots WHERE contact_id IN ${family}
           ORDER BY scheduled_at DESC LIMIT $2`,
    params: [id, DETAIL_LIMIT],
  }
  const agent: AdminQuery = {
    text: `SELECT id::text, client_service AS title, client_name AS written, received_at AS at
           FROM agent_leads WHERE contact_id IN ${family}
           ORDER BY received_at DESC LIMIT $2`,
    params: [id, DETAIL_LIMIT],
  }
  const candidates: AdminQuery = {
    text: `SELECT d.id::text, d.display_name, d.company, d.email, d.phone,
                  CASE
                    WHEN lower(btrim(d.display_name)) = lower(btrim(c.display_name)) THEN 'jmeno'
                    WHEN d.ico IS NOT NULL AND d.ico = c.ico THEN 'ico'
                    ELSE 'firma'
                  END AS reason
           FROM contacts c
           JOIN contacts d ON d.merged_into IS NULL AND d.id <> c.id AND (
                  lower(btrim(d.display_name)) = lower(btrim(c.display_name))
               OR (d.ico IS NOT NULL AND d.ico = c.ico)
               OR (d.company IS NOT NULL AND lower(btrim(d.company)) = lower(btrim(c.company)))
             )
           WHERE c.id = $1
           ORDER BY d.display_name LIMIT $2`,
    params: [id, DETAIL_LIMIT],
  }

  const [headRows, mergedRows, projectRows, leadRows, slotRows, agentRows, candidateRows] =
    await adminDb.batch([head, merged, projects, leads, slots, agent, candidates])

  const contact = (headRows[0] as unknown as ContactRow) ?? null
  if (contact === null) return null

  // Firmy od AI asistenta (R-141) zvlášť: bez migrace 130 sloupec contact_id
  // není a dávka výš by spadla celá.
  let outreachRows: AdminRow[] = []
  try {
    ;[outreachRows] = await adminDb.batch([
      {
        text: `SELECT id::text, company_name AS title, coalesce(contact_name, phone, email) AS written,
                      coalesce(last_call_at, received_at) AS at
               FROM outreach_leads WHERE contact_id IN ${family}
               ORDER BY coalesce(last_call_at, received_at) DESC LIMIT $2`,
        params: [id, DETAIL_LIMIT],
      },
    ])
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code !== '42P01' && code !== '42703') throw err
  }

  const occurrences: ContactOccurrence[] = [
    ...projectRows.map((r) => ({ kind: 'zakazka' as const, id: String(r.id), title: String(r.title), written: r.written as string | null, at: r.at as string | null, href: `/dashboard/${String(r.id)}` })),
    ...leadRows.map((r) => ({ kind: 'hovor' as const, id: String(r.id), title: String(r.title), written: r.written as string | null, at: r.at as string | null, href: '/dashboard/calls' })),
    ...slotRows.map((r) => ({ kind: 'konzultace' as const, id: String(r.id), title: String(r.title), written: r.written as string | null, at: r.at as string | null, href: '/dashboard/calendar' })),
    ...agentRows.map((r) => ({ kind: 'poptavka' as const, id: String(r.id), title: String(r.title), written: r.written as string | null, at: r.at as string | null, href: '/dashboard/poptavky' })),
    ...outreachRows.map((r) => ({ kind: 'asistent' as const, id: String(r.id), title: String(r.title), written: r.written as string | null, at: r.at as string | null, href: `/dashboard/ai-asistent/kontakt/${String(r.id)}` })),
  ]

  return {
    contact,
    merged: mergedRows as unknown as ContactDetail['merged'],
    occurrences,
    candidates: candidateRows as unknown as ContactCandidate[],
  }
}

export type ContactFields = {
  display_name: string
  company: string | null
  email: string | null
  phone: string | null
  ico: string | null
  dic: string | null
  /** Sídlo / fakturační adresa (R-153). Chybí u volání sestavených před ním. */
  address?: string | null
  note: string | null
}

/** Údaje do podoby, kterou uznává databáze (E.164, e-mail malými písmeny). */
export function normalizeContactFields(input: ContactFields): ContactFields {
  return {
    display_name: input.display_name.trim(),
    company: trimOrNull(input.company),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    ico: normalizeIco(input.ico),
    dic: normalizeDic(input.dic),
    address: input.address === undefined ? undefined : trimOrNull(input.address),
    note: trimOrNull(input.note),
  }
}

export type ContactWriteResult = { ok: true; id: string } | { ok: false; error: string }

/** Úspěšné uložení nese i to, co kontakt měl předtím — podle toho se změna propíše dál (R-141). */
export type ContactSaveResult =
  | { ok: true; id: string; previous: ContactPrevious }
  | { ok: false; error: string }

/** Co měl kontakt před uložením: podle toho se změna propíše dál (R-141, R-153). */
export type ContactPrevious = {
  email: string | null
  phone: string | null
  ico: string | null
  dic: string | null
  address: string | null
}

/** Kdo už ten telefon nebo e-mail má — pro hlášku místo kódu chyby. */
async function holder(fields: ContactFields, exceptId: string | null): Promise<string | null> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT display_name FROM contacts
             WHERE merged_into IS NULL AND ($3::uuid IS NULL OR id <> $3)
               AND ((phone IS NOT NULL AND phone = $1) OR (email IS NOT NULL AND lower(email) = lower($2)))
             LIMIT 1`,
      params: [fields.phone, fields.email, exceptId],
    },
  ])
  return rows.length > 0 ? String(rows[0].display_name) : null
}

const DUPLICATE = '23505'
const isDuplicate = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === DUPLICATE

/**
 * Sídlo kontaktu (R-153) zvlášť: sloupec přidává migrace 140 a na databázi
 * bez ní se uložení ostatních údajů nesmí zastavit. Chybějící sloupec se
 * přeskočí, jiná chyba projde.
 */
async function saveContactAddress(id: string, address: string | null): Promise<void> {
  try {
    await adminDb.batch([{ text: `UPDATE contacts SET address = $2 WHERE id = $1`, params: [id, address] }])
  } catch (e) {
    if ((e as { code?: string })?.code !== '42703') throw e
  }
}

export async function saveContactFields(id: string, input: ContactFields): Promise<ContactSaveResult> {
  const fields = normalizeContactFields(input)
  if (fields.display_name === '') return { ok: false, error: 'Jméno kontaktu musí být vyplněné.' }
  if (trimOrNull(input.phone) !== null && fields.phone === null) {
    return { ok: false, error: 'Telefonu nerozumím. Zkuste ho zapsat jako +420 777 123 456.' }
  }
  if (trimOrNull(input.email) !== null && fields.email === null) {
    return { ok: false, error: 'E-mail nemá správný tvar.' }
  }

  try {
    const [rows] = await adminDb.batch([
      {
        // `old` vidí řádek před úpravou (stejný snímek příkazu).
        text: `WITH old AS (SELECT o.id, o.email, o.phone, o.ico, o.dic, to_jsonb(o) ->> 'address' AS address
                           FROM contacts o WHERE o.id = $1)
               UPDATE contacts c
               SET display_name = $2, company = $3, email = $4, phone = $5, ico = $6, dic = $7, note = $8
               FROM old
               WHERE c.id = old.id
               RETURNING c.id::text, old.email AS old_email, old.phone AS old_phone,
                         old.ico AS old_ico, old.dic AS old_dic, old.address AS old_address`,
        params: [id, fields.display_name, fields.company, fields.email, fields.phone, fields.ico, fields.dic, fields.note],
      },
    ])
    if (rows.length === 0) return { ok: false, error: 'Kontakt už neexistuje.' }
    if (fields.address !== undefined) await saveContactAddress(id, fields.address)
    const old = (key: string) => (rows[0][key] as string | null) ?? null
    return {
      ok: true,
      id: String(rows[0].id),
      previous: { email: old('old_email'), phone: old('old_phone'), ico: old('old_ico'), dic: old('old_dic'), address: old('old_address') },
    }
  } catch (e) {
    if (!isDuplicate(e)) throw e
    const who = await holder(fields, id)
    return {
      ok: false,
      error: who !== null ? `Tenhle telefon nebo e-mail už má kontakt ${who}. Slučte je místo přepisování.` : 'Tenhle telefon nebo e-mail už má jiný kontakt.',
    }
  }
}

export type EnsureContactInput = {
  name: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  source?: string
  seenAt?: string | null
}

/**
 * Najde kontakt podle telefonu, pak podle e-mailu, jinak ho založí. Nikdy
 * nevyhodí kvůli duplicitě — závod dvou zápisů skončí dohledáním toho,
 * kdo byl první.
 */
export async function ensureContact(input: EnsureContactInput): Promise<string | null> {
  const phone = normalizePhone(input.phone)
  const email = normalizeEmail(input.email)
  const name = trimOrNull(input.name) ?? trimOrNull(input.company) ?? phone ?? email
  if (name === null) return null

  const found = await findContact(phone, email)
  if (found !== null) {
    await adminDb.batch([
      {
        // Firma, čas a chybějící telefon nebo e-mail (R-141). Vyplněný údaj
        // se nepřepisuje a údaj, který už má jiný kontakt, se nedosadí —
        // to je duplicita ke sloučení, ne oprava (a zápis by spadl na unique).
        text: `UPDATE contacts c
               SET last_seen_at = greatest(coalesce(c.last_seen_at, 'epoch'::timestamptz), coalesce($2::timestamptz, now())),
                   company = coalesce(c.company, $3),
                   email = CASE WHEN c.email IS NULL AND $4::text IS NOT NULL AND NOT EXISTS (
                             SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id
                                AND d.email IS NOT NULL AND lower(d.email) = lower($4::text))
                           THEN $4 ELSE c.email END,
                   phone = CASE WHEN c.phone IS NULL AND $5::text IS NOT NULL AND NOT EXISTS (
                             SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id AND d.phone = $5::text)
                           THEN $5 ELSE c.phone END
               WHERE c.id = $1`,
        params: [found, input.seenAt ?? null, trimOrNull(input.company), email, phone],
      },
    ])
    return found
  }

  try {
    const [rows] = await adminDb.batch([
      {
        text: `INSERT INTO contacts (display_name, company, email, phone, source, last_seen_at)
               VALUES ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))
               RETURNING id::text`,
        params: [name, trimOrNull(input.company), email, phone, input.source ?? 'manual', input.seenAt ?? null],
      },
    ])
    return String(rows[0].id)
  } catch (e) {
    if (!isDuplicate(e)) throw e
    return await findContact(phone, email)
  }
}

/** Kontakt podle telefonu, pak podle e-mailu; sloučené vede na jejich cíl. */
export async function findContact(phone: string | null, email: string | null): Promise<string | null> {
  if (phone === null && email === null) return null
  const [rows] = await adminDb.batch([
    {
      // Telefon má přednost před e-mailem (e-mail bývá firemní a sdílený),
      // proto se z obou shod vybírá podle `poradi`, ne podle náhody.
      text: `SELECT id FROM (
               SELECT coalesce(merged_into, id)::text AS id, 1 AS poradi
               FROM contacts WHERE $1::text IS NOT NULL AND phone = $1
               UNION ALL
               SELECT coalesce(merged_into, id)::text AS id, 2 AS poradi
               FROM contacts WHERE $2::text IS NOT NULL AND email IS NOT NULL AND lower(email) = lower($2)
             ) x ORDER BY poradi LIMIT 1`,
      params: [phone, email],
    },
  ])
  return rows.length > 0 ? String(rows[0].id) : null
}

export type MergeResult = { ok: true; target: string } | { ok: false; error: string }

/**
 * Sloučí kontakt do jiného: nastaví `merged_into`. Nic se nemaže ani
 * nepřepisuje, takže „Zpět" stačí jedna hodnota (`unmergeContact`).
 *
 * Co bylo sloučené do zdroje, jde s ním — řetěz zůstává plochý, aby čtení
 * nikdy nehledalo víc než jeden skok.
 */
export async function mergeContact(sourceId: string, targetId: string): Promise<MergeResult> {
  if (sourceId === targetId) return { ok: false, error: 'Kontakt nejde sloučit sám se sebou.' }
  const [rows] = await adminDb.batch([
    {
      // `cil` vznikne jen pro existující kontakt, `zdroj` jen pro nesloučený —
      // počty v podmínce tak zastaví sloučení do neexistujícího kontaktu
      // i druhé sloučení téhož řádku. Cíl sloučený do zdroje by byl cyklus.
      text: `WITH cil AS (SELECT contacts_root(c.id) AS id FROM contacts c WHERE c.id = $2),
                  zdroj AS (SELECT id FROM contacts WHERE id = $1 AND merged_into IS NULL)
             UPDATE contacts
             SET merged_into = (SELECT id FROM cil)
             WHERE (SELECT count(*) FROM cil) = 1
               AND (SELECT count(*) FROM zdroj) = 1
               AND (SELECT id FROM cil) <> $1
               AND (id = $1 OR merged_into = $1)
               AND id <> (SELECT id FROM cil)
             RETURNING id::text, merged_into::text`,
      params: [sourceId, targetId],
    },
  ])
  if (rows.length === 0) return { ok: false, error: 'Sloučení neproběhlo — jeden z kontaktů už neexistuje nebo je sloučený.' }
  return { ok: true, target: String(rows[0].merged_into) }
}

/** Zpět po sloučení: smaže `merged_into`, kontakt je zase samostatný. */
export async function unmergeContact(sourceId: string): Promise<ContactWriteResult> {
  try {
    const [rows] = await adminDb.batch([
      {
        text: `UPDATE contacts SET merged_into = NULL WHERE id = $1 AND merged_into IS NOT NULL RETURNING id::text`,
        params: [sourceId],
      },
    ])
    if (rows.length === 0) return { ok: false, error: 'Kontakt sloučený není.' }
    return { ok: true, id: String(rows[0].id) }
  } catch (e) {
    if (!isDuplicate(e)) throw e
    return { ok: false, error: 'Rozdělit zpět to nejde: telefon nebo e-mail mezitím převzal jiný kontakt.' }
  }
}

export type ContactSuggestion = {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
}

/**
 * Našeptávač kontaktů (R-141): okno události v kalendáři si po výběru vezme
 * jméno, telefon a e-mail, ať se nemusí opisovat. Jen nesloučené kontakty,
 * nejdřív ty, se kterými jste byli v kontaktu naposledy.
 */
export async function suggestContacts(raw: string, limit = 6): Promise<ContactSuggestion[]> {
  const q = raw.trim().slice(0, 80)
  if (q.length < 2) return []
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const digits = q.replace(/\D/g, '')
  const [rows] = await adminDb.batch([
    {
      text: `SELECT id::text AS id, display_name AS name, company, email, phone
               FROM contacts
              WHERE merged_into IS NULL
                AND (display_name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1
                     OR ($2::text IS NOT NULL AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE $2))
              ORDER BY last_seen_at DESC NULLS LAST, display_name
              LIMIT $3`,
      params: [like, digits.length >= 3 ? `%${digits}%` : null, Math.min(Math.max(limit, 1), 10)],
    },
  ])
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    company: (r.company as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
  }))
}
