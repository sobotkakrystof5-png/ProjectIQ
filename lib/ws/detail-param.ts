// Pravý panel s detailem: stav v URL (`?detail=zakaznik:<id>`), aby šel
// odkaz sdílet a tlačítko Zpět v prohlížeči panel zavřelo (AGENTS.md → B9).
// Bez závislostí, používá ho server i klient.

export type DetailRef =
  | { kind: 'zakaznik'; id: string }
  | { kind: 'poptavka'; id: string }
  | { kind: 'termin'; id: string }
  /** „Komu napsat“ → Připravit zprávu (S12): zákazník a důvod. */
  | { kind: 'zprava'; id: string; topic: MessageTopic }
  | { kind: 'nova-rezervace' }
  | { kind: 'nova-blokace' }
  | { kind: 'nova-faktura' }

export const MESSAGE_TOPICS = ['birthday', 'almost', 'winback', 'thanks'] as const
export type MessageTopic = (typeof MESSAGE_TOPICS)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseDetail(raw: string | string[] | undefined | null): DetailRef | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || value.length > 60) return null
  if (value === 'nova-rezervace' || value === 'nova-blokace' || value === 'nova-faktura') return { kind: value }
  const [kind, id, topic] = value.split(':')
  if (kind === 'zprava' && id && UUID_RE.test(id) && (MESSAGE_TOPICS as readonly string[]).includes(topic)) {
    return { kind, id: id.toLowerCase(), topic: topic as MessageTopic }
  }
  if ((kind === 'zakaznik' || kind === 'poptavka' || kind === 'termin') && id && UUID_RE.test(id)) return { kind, id: id.toLowerCase() }
  return null
}

export function detailValue(ref: DetailRef): string {
  if (ref.kind === 'zprava') return `zprava:${ref.id}:${ref.topic}`
  return 'id' in ref ? `${ref.kind}:${ref.id}` : ref.kind
}

type Params = Record<string, string | string[] | undefined>

/**
 * Odkaz na stejnou stránku se změněnými parametry. `null` parametr smaže.
 * Ostatní parametry (týden, vybraný zákazník) zůstanou.
 */
export function hrefWith(pathname: string, current: Params, patch: Record<string, string | null>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    if (key in patch) continue
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) params.set(key, first)
  }
  for (const [key, value] of Object.entries(patch)) if (value !== null) params.set(key, value)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
