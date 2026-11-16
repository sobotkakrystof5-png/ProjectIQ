import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { toLikePattern } from '@/lib/admin-search'

/**
 * Z nápovědy od modelu („Novák", „2026014") právě jeden záznam (R-111).
 *
 * Pravidlo z AD14 platí dál: **nikdy se nehádá**. Buď sedí identifikátor
 * z kontextu, nebo nápověda najde právě jeden záznam. Dvě shody jsou otázka
 * pro člověka („Zakázek Novák je víc"), ne losování — špatně přiřazená
 * platba je horší než doptání.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Resolved = { ok: true; id: string } | { ok: false; error: string }

export type Ref = { id: string | null; hint: string | null }

/** Koncovky pádů, které se z diktovaného jména nejčastěji ztratí („Nováka", „Novákovi", „Novákem"). */
const ENDINGS = ['ovou', 'ovi', 'ové', 'em', 'ou', 'ho', 'mu', 'a', 'e', 'u', 'y', 'i', 'ě'] as const

/**
 * Varianty nápovědy k hledání: nejdřív přesně, pak nejdelší slovo bez koncovky.
 * Model má jména psát v prvním pádě, ale přepis hlasu a člověk to nedodrží.
 */
export function nameCandidates(hint: string): string[] {
  const trimmed = hint.trim()
  if (!trimmed) return []
  const out = [trimmed]
  const longest = trimmed
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)[0]
  if (longest) {
    const lower = longest.toLowerCase()
    const ending = ENDINGS.find((e) => lower.endsWith(e) && lower.length - e.length >= 3)
    const stem = ending ? longest.slice(0, longest.length - ending.length) : longest
    if (stem !== trimmed) out.push(stem)
  }
  return out
}

/** Projde varianty nápovědy a vrátí první, která něco našla. */
async function byHint(
  hint: string | null,
  find: (pattern: string) => Promise<string[]>,
): Promise<string[]> {
  if (!hint) return []
  for (const candidate of nameCandidates(hint)) {
    const pattern = toLikePattern(candidate)
    if (!pattern) continue
    const ids = await find(pattern)
    if (ids.length > 0) return ids
  }
  return []
}

function decide(ids: string[], what: { none: string; many: string }): Resolved {
  if (ids.length === 1) return { ok: true, id: ids[0] }
  return { ok: false, error: ids.length === 0 ? what.none : what.many }
}

export async function resolveProject(ref: Ref | null): Promise<Resolved> {
  if (ref?.id && UUID.test(ref.id)) {
    const rows = await adminDb`SELECT id::text AS id FROM projects WHERE id = ${ref.id} LIMIT 1`
    if (rows[0]) return { ok: true, id: String(rows[0].id) }
  }
  const hint = ref?.hint?.trim() || null
  const ids = await byHint(hint, async (pattern) => {
    const rows = await adminDb`
      SELECT id::text AS id FROM projects
      WHERE client_name ILIKE ${pattern} ESCAPE '\'
      ORDER BY created_at DESC LIMIT 2
    `
    return rows.map((r) => String(r.id))
  })
  return decide(ids, {
    none: hint ? `Zakázku „${hint}" jsem nenašel.` : 'Nevím, o kterou zakázku jde. Řekněte jméno klienta.',
    many: `Zakázek „${hint}" je víc. Otevřete tu správnou a řekněte to odtamtud.`,
  })
}

export async function resolveLead(ref: Ref | null): Promise<Resolved> {
  if (ref?.id && UUID.test(ref.id)) {
    const rows = await adminDb`SELECT id::text AS id FROM client_leads WHERE id = ${ref.id} LIMIT 1`
    if (rows[0]) return { ok: true, id: String(rows[0].id) }
  }
  const hint = ref?.hint?.trim() || null
  const ids = await byHint(hint, async (pattern) => {
    const rows = await adminDb`
      SELECT id::text AS id FROM client_leads
      WHERE company_name ILIKE ${pattern} ESCAPE '\' OR contact_name ILIKE ${pattern} ESCAPE '\'
      ORDER BY created_at DESC LIMIT 2
    `
    return rows.map((r) => String(r.id))
  })
  return decide(ids, {
    none: hint ? `Kontakt „${hint}" jsem v Hovorech nenašel.` : 'Nevím, ke kterému kontaktu to patří.',
    many: `Kontaktů „${hint}" je víc. Upřesněte firmu nebo jméno.`,
  })
}

/**
 * Termín z kalendáře — jen vlastní události a blokace (`manual`, `block`):
 * rezervace z portálu, hovory a termíny zakázek mají zdroj jinde a mění se tam.
 * Bez data se hledá od včerejška dál, ať „zruš schůzku s Novákem" nesáhne
 * na tu z loňska.
 */
export async function resolveEvent(ref: Ref & { date: string | null }): Promise<Resolved> {
  if (ref.id && UUID.test(ref.id)) {
    const rows = await adminDb`
      SELECT id::text AS id FROM calendar_events
      WHERE id = ${ref.id} AND event_type IN ('manual', 'block') LIMIT 1
    `
    if (rows[0]) return { ok: true, id: String(rows[0].id) }
  }
  const hint = ref.hint?.trim() || null
  const date = ref.date

  if (!hint && date) {
    // „Zruš ten zítřejší termín" — sedí jen tehdy, když je ten den jediný.
    const rows = await adminDb`
      SELECT id::text AS id FROM calendar_events
      WHERE event_type IN ('manual', 'block')
        AND (starts_at AT TIME ZONE 'Europe/Prague')::date = ${date}::date
      ORDER BY starts_at LIMIT 2
    `
    return decide(rows.map((r) => String(r.id)), {
      none: `V kalendáři ${date} nemám žádný vlastní termín.`,
      many: `Na ${date} je v kalendáři víc termínů. Řekněte s kým.`,
    })
  }

  const ids = await byHint(hint, async (pattern) => {
    const rows = await adminDb`
      SELECT e.id::text AS id FROM calendar_events e
      LEFT JOIN client_leads l ON l.calendar_event_id = e.id
      WHERE e.event_type IN ('manual', 'block')
        AND (e.title ILIKE ${pattern} ESCAPE '\' OR l.contact_name ILIKE ${pattern} ESCAPE '\')
        AND (
          (${date}::date IS NOT NULL AND (e.starts_at AT TIME ZONE 'Europe/Prague')::date = ${date}::date)
          OR (${date}::date IS NULL AND e.starts_at >= now() - interval '1 day')
        )
      ORDER BY e.starts_at LIMIT 2
    `
    return rows.map((r) => String(r.id))
  })
  return decide(ids, {
    none: hint ? `Termín „${hint}" jsem v kalendáři nenašel.` : 'Nevím, o který termín jde.',
    many: `Termínů „${hint}" je v kalendáři víc. Řekněte, který den.`,
  })
}

/**
 * Faktura podle čísla nebo odběratele. Stornované se nehledají nikdy;
 * `unpaidOnly` zúží hledání na nezaplacené („Novák zaplatil fakturu").
 */
export async function resolveInvoice(ref: Ref, options: { unpaidOnly: boolean }): Promise<Resolved> {
  const unpaidOnly = options.unpaidOnly
  if (ref.id && UUID.test(ref.id)) {
    const rows = await adminDb`SELECT id::text AS id FROM invoices WHERE id = ${ref.id} AND cancelled_at IS NULL LIMIT 1`
    if (rows[0]) return { ok: true, id: String(rows[0].id) }
  }
  const hint = ref.hint?.trim() || null
  if (!hint) return { ok: false, error: 'Nevím, o kterou fakturu jde. Řekněte číslo nebo odběratele.' }

  // Číslo faktury se hledá přesně, bez mezer („2026 014" z diktování).
  const compact = hint.replace(/\s+/g, '')
  if (/^\d{4,}$/.test(compact)) {
    const rows = await adminDb`
      SELECT id::text AS id FROM invoices
      WHERE invoice_number = ${compact} AND cancelled_at IS NULL
        AND (${unpaidOnly} = false OR paid_on IS NULL)
      LIMIT 2
    `
    if (rows.length > 0) {
      return decide(rows.map((r) => String(r.id)), { none: '', many: `Faktur s číslem ${compact} je víc.` })
    }
  }

  const ids = await byHint(hint, async (pattern) => {
    const rows = await adminDb`
      SELECT i.id::text AS id FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.cancelled_at IS NULL
        AND (${unpaidOnly} = false OR i.paid_on IS NULL)
        AND (i.client_name ILIKE ${pattern} ESCAPE '\' OR p.client_name ILIKE ${pattern} ESCAPE '\')
      ORDER BY i.issued_on DESC LIMIT 2
    `
    return rows.map((r) => String(r.id))
  })
  return decide(ids, {
    none: unpaidOnly ? `Nezaplacenou fakturu „${hint}" jsem nenašel.` : `Fakturu „${hint}" jsem nenašel.`,
    many: `Faktur „${hint}" je víc. Řekněte číslo faktury.`,
  })
}
