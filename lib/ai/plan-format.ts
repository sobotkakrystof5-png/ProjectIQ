import { z } from 'zod'
import { actionSchema, ACTIONS_MAX, type Action, type Suggestion } from '@/lib/ai/suggestion-schema'

/**
 * Odpověď modelu → plán, který projde `suggestionSchema` (R-111).
 *
 * **Proč ne strukturovaný výstup (`output_config.format`):** API si ze
 * schématu kompiluje gramatiku a má na ni stropy, na které jsme 2026-11-16
 * živě narazili jeden po druhém — „compiled grammar is too large", nejvýš
 * 16 polí s `null`, nejvýš 24 nepovinných polí. Ani schéma bez omezení se
 * všemi poli povinnými se nevešlo: třináct druhů akcí v jednom sjednocení
 * je na gramatiku moc. Tvar akcí proto model dostane popsaný v promptu
 * (`proposeCatalogue`) a vrací obyčejný JSON.
 *
 * Bezpečnost tím neklesá: o tvaru nikdy nerozhodovala gramatika, ale tahle
 * přísná kontrola. Akce, která jí neprojde, se zahodí a člověk se dozví
 * proč — celý plán kvůli jednomu špatnému času nepadá. Odpověď, která
 * vůbec není JSON, vrátí `null` a `propose.ts` zkusí silnější model.
 */

/** JSON z odpovědi — model ho občas obalí do ``` nebo přidá větu okolo. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // pokračuj — zkus vytáhnout první objekt
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Čísla, kde nula znamená „nezaznělo" (nulová částka ani délka nedává smysl). */
const ZERO_IS_EMPTY = new Set(['amount', 'price', 'durationMinutes'])

/** Prázdný text a nula → `null`; odkaz, kde je všechno prázdné, → `null`. */
export function emptyToNull(value: unknown, key?: string): unknown {
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (typeof value === 'number') return value === 0 && key && ZERO_IS_EMPTY.has(key) ? null : value
  if (Array.isArray(value)) return value.map((v) => emptyToNull(v))
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = emptyToNull(v, k)
  // `{ id: null, hint: null }` (a u termínu i `date: null`) je „žádný záznam".
  const keys = Object.keys(out)
  const isRef = keys.includes('hint') && keys.every((k) => ['id', 'hint', 'date'].includes(k))
  if (isRef && keys.every((k) => out[k] === null)) return null
  return out
}

/** Které pole s odkazem akce povinně má — i když ho model úplně vynechá. */
const REQUIRED_REF: Record<string, 'ref' | 'event' | 'invoice'> = {
  add_note: 'ref',
  send_message: 'ref',
  update_contact: 'ref',
  move_event: 'event',
  cancel_event: 'event',
  update_event: 'event',
  mark_invoice_paid: 'invoice',
  cancel_invoice: 'invoice',
}

/** Drobnosti, které model píše jinak, než chceme, a jdou opravit bez hádání. */
function normalizeAction(raw: unknown): unknown {
  const a = emptyToNull(raw)
  if (!a || typeof a !== 'object') return a
  const action = { ...(a as Record<string, unknown>) }
  const time = action.time
  if (typeof time === 'string') {
    if (/^\d{2}:\d{2}:\d{2}$/.test(time)) action.time = time.slice(0, 5) // „14:00:00"
    else if (/^\d:\d{2}$/.test(time)) action.time = `0${time}` // „9:30"
  }
  // Termín bez délky: prompt říká 60 minut, model ji ale občas nechá prázdnou.
  if (action.kind === 'schedule_event' && action.durationMinutes == null) action.durationMinutes = 60
  // Povinný odkaz (poznámka, termín, faktura, stav zakázky) nesmí zůstat `null` —
  // prázdný odkaz pak executor odmítne českou hláškou místo pádu schématu.
  const requiredRef = REQUIRED_REF[String(action.kind)]
  if (requiredRef && action[requiredRef] == null) {
    action[requiredRef] = requiredRef === 'event' ? { id: null, hint: null, date: null } : { id: null, hint: null }
  }
  if ((action.kind === 'update_project_status' || action.kind === 'update_project') && action.project == null) {
    action.project = { id: null, hint: null }
  }
  // Paměť bez rozsahu: se zakázkou patří k ní, jinak je obecná.
  if (action.kind === 'remember') {
    if (action.scope == null) action.scope = action.project ? 'project' : 'global'
    if (action.memoryKind == null) action.memoryKind = 'summary'
  }
  return action
}

const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '')
const clipList = (value: unknown, items: number, chars: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .slice(0, items)
        .map((v) => v.slice(0, chars))
    : []

/**
 * Z odpovědi modelu plán, který projde `suggestionSchema`. Vrací `null`,
 * když odpověď vůbec není plán (není to JSON, chybí `actions`).
 */
export function coercePlan(text: string): Suggestion | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { actions?: unknown }).actions)) return null
  const r = raw as Record<string, unknown>

  const actions: Action[] = []
  const missing = clipList(r.missing, 8, 120)
  for (const candidate of (r.actions as unknown[]).slice(0, ACTIONS_MAX)) {
    const parsed = actionSchema.safeParse(normalizeAction(candidate))
    if (parsed.success) actions.push(parsed.data)
    else if (missing.length < 8) {
      const kind = (candidate as { kind?: unknown })?.kind
      missing.push(
        `Jednu akci jsem nesestavil správně${typeof kind === 'string' ? ` (${kind})` : ''} — řekněte ji znovu.`.slice(0, 120),
      )
    }
  }
  const confidence =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0

  return {
    actions,
    reply: clip(r.reply, 500),
    confidence,
    assumptions: clipList(r.assumptions, 5, 200),
    missing,
  }
}

// ── Dotazy na data (A4) ────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Co si model smí nechat dohledat, než odpoví nebo sestaví plán. Jen čtení
 * a jen tyhle tvary — žádný volný dotaz do databáze (`lib/admin/assistant-lookups.ts`).
 */
export const lookupSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('calendar'), from: z.string().regex(DAY), to: z.string().regex(DAY) }),
  z.object({
    kind: z.literal('free_time'),
    date: z.string().regex(DAY),
    durationMinutes: z.number().int().min(15).max(480).nullable().default(null),
  }),
  z.object({ kind: z.literal('project'), hint: z.string().trim().min(2).max(160) }),
  z.object({ kind: z.literal('contact'), hint: z.string().trim().min(2).max(160) }),
  z.object({ kind: z.literal('unpaid') }),
])

export type Lookup = z.infer<typeof lookupSchema>

/** Nejvíc dotazů na jednu větu — víc nikdo nepotřebuje a každý stojí čas i tokeny. */
export const LOOKUPS_MAX = 3

/** Dotazy z odpovědi modelu. Neplatné se tiše vynechají — nejsou to akce, nic nekonají. */
export function coerceLookups(text: string): Lookup[] {
  const raw = extractJson(text)
  const list = raw && typeof raw === 'object' ? (raw as { lookups?: unknown }).lookups : null
  if (!Array.isArray(list)) return []
  const out: Lookup[] = []
  for (const candidate of list.slice(0, LOOKUPS_MAX)) {
    const parsed = lookupSchema.safeParse(emptyToNull(candidate))
    if (parsed.success) out.push(parsed.data)
  }
  return out
}
