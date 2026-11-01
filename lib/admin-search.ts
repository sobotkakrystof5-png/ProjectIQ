// Hledání v administraci (⌘K): čisté funkce. První verze jen přechod na stránku.

export const SEARCH_MIN_CHARS = 2
export const SEARCH_MAX_CHARS = 80
export const SEARCH_LIMIT_PER_KIND = 5

export type SearchKind = 'page' | 'project' | 'lead' | 'invoice'

export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  subtitle?: string
  href: string
}

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  page: 'Stránky',
  project: 'Zakázky',
  lead: 'Hovory a leady',
  invoice: 'Faktury',
}

/** Bez diakritiky a malými písmeny, aby „zakazky“ našlo „Zakázky“. */
export function normalizeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Dotaz od uživatele pro databázi: oříznutý, bez zástupných znaků LIKE; null = příliš krátký. */
export function toLikePattern(query: string): string | null {
  const trimmed = query.trim().slice(0, SEARCH_MAX_CHARS)
  if (trimmed.length < SEARCH_MIN_CHARS) return null
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function filterPages(
  items: { href: string; label: string }[],
  query: string,
): SearchHit[] {
  const q = normalizeQuery(query)
  if (!q) return []
  return items
    .filter((i) => normalizeQuery(i.label).includes(q))
    .slice(0, SEARCH_LIMIT_PER_KIND)
    .map((i) => ({ kind: 'page' as const, id: i.href, title: i.label, href: i.href }))
}
