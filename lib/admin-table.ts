/**
 * Řazení, stránkování a odkazy sdílené tabulky adminu (AD07).
 *
 * Stav seznamu (řazení, stránka, filtry) žije **v URL**, ne ve stavu komponenty.
 * Díky tomu je řazení obyčejný odkaz: funguje tlačítko Zpět, odkaz na konkrétní
 * stránku jde poslat a nic se kvůli tomu nemusí hydratovat v prohlížeči.
 *
 * Bezpečnost: `ORDER BY` se nedá parametrizovat, proto se klíč z URL nikdy
 * nedostane do SQL. Z adresy se jen **vybírá** ze seznamu povolených sloupců;
 * neznámý klíč spadne na výchozí řazení (B13 — každý vstup validovat na serveru).
 */

export type SortDir = 'asc' | 'desc'

/** Povolený sloupec: výraz do `ORDER BY` a směr při prvním kliknutí. */
export type SortColumn = {
  /** SQL výraz. Pochází z kódu, nikdy od uživatele. */
  sql: string
  /** Výchozí směr (data a částky se čtou odshora, jména odzadu ne). */
  dir?: SortDir
}

export type TableParamsOptions = {
  /** Klíč v URL → sloupec. Co tu není, do SQL se nedostane. */
  allowed: Record<string, SortColumn | string>
  /** Klíč výchozího řazení; musí být v `allowed`. */
  defaultSort: string
  /** Kolik řádků na stránku. */
  pageSize?: number
  /**
   * Předpona parametrů, když je na jedné obrazovce víc tabulek
   * (`?faktury_sort=…` vedle `?naklady_sort=…`).
   */
  prefix?: string
  /**
   * Sloupec na dorovnání pořadí. Bez něj může Postgres u shodných hodnot
   * vrátit řádek na dvou stránkách a jiný vynechat.
   */
  tiebreak?: string
}

export type TableParams = {
  sortKey: string
  dir: SortDir
  /** Stránka od 1. */
  page: number
  pageSize: number
  limit: number
  offset: number
  /** Hotový fragment `ORDER BY …` složený jen z povolených sloupců. */
  orderBy: string
}

export type SearchParamsLike = Record<string, string | string[] | undefined> | undefined

/** Nejvyšší stránka, na kterou se dá odkázat. Dál už je to jen drahý `OFFSET`. */
const MAX_PAGE = 1000
const DEFAULT_PAGE_SIZE = 50

function first(searchParams: SearchParamsLike, key: string): string | undefined {
  const value = searchParams?.[key]
  return Array.isArray(value) ? value[0] : value
}

function column(spec: SortColumn | string): SortColumn {
  return typeof spec === 'string' ? { sql: spec } : spec
}

/**
 * Z adresy udělá ověřené řazení a stránkování. Neznámý `sort`, `dir` ani `page`
 * nic nerozbije — spadne se na výchozí hodnoty.
 */
export function parseTableParams(searchParams: SearchParamsLike, options: TableParamsOptions): TableParams {
  const p = options.prefix ? `${options.prefix}_` : ''
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  const rawSort = first(searchParams, `${p}sort`)
  const sortKey = rawSort && Object.hasOwn(options.allowed, rawSort) ? rawSort : options.defaultSort
  const spec = column(options.allowed[sortKey] ?? options.allowed[options.defaultSort])

  const rawDir = first(searchParams, `${p}dir`)
  const dir: SortDir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : (spec.dir ?? 'desc')

  const rawPage = Number.parseInt(first(searchParams, `${p}page`) ?? '1', 10)
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), MAX_PAGE) : 1

  // `NULLS LAST` v obou směrech: prázdná hodnota je vždy na konci, ať se řadí
  // jakkoli. Postgres by jinak u sestupného řazení dal prázdné řádky nahoru.
  const parts = [`${spec.sql} ${dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`]
  if (options.tiebreak && options.tiebreak !== spec.sql) parts.push(`${options.tiebreak} DESC`)

  return {
    sortKey,
    dir,
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    orderBy: `ORDER BY ${parts.join(', ')}`,
  }
}

/** Opačný směr — co udělá kliknutí na už seřazený sloupec. */
export function flipDir(dir: SortDir): SortDir {
  return dir === 'asc' ? 'desc' : 'asc'
}

/**
 * Adresa se změněnými parametry. `null` parametr odstraní, takže se v URL
 * nehromadí `page=1` a `dir=desc`.
 */
export function tableHref(
  basePath: string,
  searchParams: SearchParamsLike,
  patch: Record<string, string | number | null | undefined>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item)
  }
  for (const [key, value] of Object.entries(patch)) {
    next.delete(key)
    if (value !== null && value !== undefined && value !== '') next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${basePath}?${query}` : basePath
}

export type TableLinks = {
  /** Odkaz na řazení podle sloupce. Stránkování se vrací na začátek. */
  sortHref: (key: string, dir: SortDir) => string
  /** Odkaz na stránku. */
  pageHref: (page: number) => string
}

/** Odkazy tabulky k předání do `<DataTable>`. */
export function tableLinks(
  basePath: string,
  searchParams: SearchParamsLike,
  options?: { prefix?: string },
): TableLinks {
  const p = options?.prefix ? `${options.prefix}_` : ''
  return {
    sortHref: (key, dir) =>
      tableHref(basePath, searchParams, { [`${p}sort`]: key, [`${p}dir`]: dir, [`${p}page`]: null }),
    pageHref: (page) => tableHref(basePath, searchParams, { [`${p}page`]: page > 1 ? page : null }),
  }
}

/** „51–100 z 237“ — co je vidět a kolik toho je. */
export function rangeLabel(params: TableParams, shown: number, total: number): string {
  if (total === 0) return '0'
  const from = params.offset + 1
  const to = params.offset + shown
  return total <= params.pageSize ? `${total}` : `${from}–${to} z ${total}`
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
}
