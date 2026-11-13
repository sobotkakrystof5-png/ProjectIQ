/**
 * Otevření asistenta odkudkoli z adminu (AD14).
 *
 * Panel visí v kostře (`AdminShell`), ale otevírá ho ⌘K — a to je jiná větev
 * stromu. Místo protahování callbacku přes celou kostru stačí jedna událost
 * na `window`: ⌘K ji pošle, panel ji poslouchá. Žádný context, žádný stav
 * navíc v kostře.
 */

const EVENT = 'zq:asistent'

export type AssistantOpenDetail = { text: string }

export function openAssistant(text: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AssistantOpenDetail>(EVENT, { detail: { text } }))
}

export function onAssistantOpen(handler: (detail: AssistantOpenDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<AssistantOpenDetail>).detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/**
 * Z adresy obrazovky odkaz na záznam, který má asistent „vidět".
 *
 * Poznává jen tvary, kde je identifikátor v cestě — `/dashboard/<id>` je
 * detail zakázky, `/dashboard/startup/<id>` startupový projekt. Kdekoli
 * jinde asistent kontext nemá a ptá se naslepo, což je v pořádku.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const STARTUP = new RegExp(`^/dashboard/startup/(${UUID})(?:/|$)`, 'i')
const PROJECT = new RegExp(`^/dashboard/(${UUID})(?:/|$)`, 'i')

export type AssistantContextRef = { kind: 'startup' | 'project' | 'lead'; id: string }

export function contextRefFromPath(pathname: string): AssistantContextRef | null {
  const startup = STARTUP.exec(pathname)
  if (startup) return { kind: 'startup', id: startup[1] }
  const project = PROJECT.exec(pathname)
  if (project) return { kind: 'project', id: project[1] }
  return null
}
