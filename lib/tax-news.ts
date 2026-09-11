import { sql } from '@/lib/db'
import type { TaxNewsSource } from '@/lib/types'

/**
 * Novinky z legislativy — stažení a parsování veřejných RSS 2.0 kanálů
 * Finanční správy a ČSSZ.
 *
 * Žádná závislost navíc a **žádná AI**: feedy jsou malé, struktura RSS 2.0
 * je plochá a filtr je obyčejné porovnání řetězců. Poslat každý titulek
 * modelu by stálo tokeny za práci, kterou zvládne `includes`.
 *
 * Je to informace, ne daňové poradenství — proto se u každé položky vždy
 * drží zdroj i datum a v UI se odkazuje na originál.
 */

// ─── Zdroje ───────────────────────────────────────────────────────────────────

export interface TaxNewsFeed {
  source: TaxNewsSource
  url: string
  /** Rozlišení kanálů téhož úřadu — jen pro logy, do DB nejde. */
  label: string
}

/**
 * Ověřené kanály bez registrace a bez tokenů.
 *
 * Finanční správa má dva kanály, které se z větší části překrývají — oba
 * spadají pod jeden `source`, takže společnou položku zahodí unikátní
 * index `(source, guid)`. Není to chyba, je to záměr.
 */
export const TAX_NEWS_FEEDS: TaxNewsFeed[] = [
  { source: 'financni_sprava', url: 'https://financnisprava.gov.cz/cs/rss/rss-novinky',        label: 'Novinky' },
  { source: 'financni_sprava', url: 'https://financnisprava.gov.cz/cs/rss/rss-tiskove-zpravy', label: 'Tiskové zprávy' },
  { source: 'cssz',            url: 'https://www.cssz.cz/web/cz/rss-kanal-novinky',            label: 'Novinky' },
]

// ─── Filtr podle klíčových slov ───────────────────────────────────────────────

/**
 * Co nás z feedu zajímá. Oba úřady publikují i věci mimo OSVČ (důchody,
 * poradenské dny, nemocenská), a ty do bloku o daních nepatří.
 *
 * Držet v základním tvaru bez diakritiky — `matchesTaxKeywords` normalizuje
 * obě strany porovnání, takže „OSVČ" najde i „osvc".
 */
export const TAX_NEWS_KEYWORDS = [
  'osvč',
  'paušál',
  'daň z příjmů',
  'dani z příjmů',
  'zálohy',
  'přiznání',
  'přehled',
  'pojistné',
] as const

/**
 * Skládá diakritiku pryč a sjednocuje velikost písmen, aby `includes`
 * fungoval i na textu, kde úřad napsal „OSVČ" a jinde „osvc".
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const NORMALIZED_KEYWORDS = TAX_NEWS_KEYWORDS.map(normalize)

/** Obyčejné porovnání řetězců nad titulkem a popisem — žádná AI, žádná heuristika. */
export function matchesTaxKeywords(item: { title: string; summary?: string | null }): boolean {
  const haystack = normalize(`${item.title} ${item.summary ?? ''}`)
  return NORMALIZED_KEYWORDS.some(kw => haystack.includes(kw))
}

// ─── Parsování RSS 2.0 ────────────────────────────────────────────────────────

export interface ParsedNewsItem {
  guid: string
  title: string
  link: string
  /** ISO string, nebo null když feed datum neuvedl nebo je nečitelné */
  publishedAt: string | null
  summary: string | null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
}

/** Popis chodí z Finanční správy jako HTML v CDATA — do databáze patří čistý text. */
function stripHtml(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vytáhne obsah prvního výskytu tagu uvnitř jedné položky, včetně CDATA obalu. */
function tagContent(itemXml: string, tag: string): string | null {
  const match = itemXml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!match) return null

  const raw = match[1].trim()
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  return cdata ? cdata[1].trim() : raw
}

/**
 * Parsuje RSS 2.0 do plochých položek.
 *
 * **`guid` padá zpátky na `link`**, protože Finanční správa žádný `<guid>`
 * neposílá — kdyby se na něj spoléhala idempotence, každý běh cronu by
 * ten feed založil znovu. Položka bez odkazu se zahazuje: bez `link`
 * nejde v UI ukázat zdroj a tabulka ho má `NOT NULL`.
 */
export function parseRssItems(xml: string): ParsedNewsItem[] {
  const items: ParsedNewsItem[] = []

  // `exec` ve smyčce místo `matchAll` — tsconfig cílí na ES5 kvůli Nextu
  // a iterace nad iterátorem by se bez `downlevelIteration` nepřeložila.
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]

    const link = tagContent(itemXml, 'link')
    const title = tagContent(itemXml, 'title')
    if (!link || !title) continue

    const cleanLink = decodeEntities(link)
    const rawDate = tagContent(itemXml, 'pubDate') ?? tagContent(itemXml, 'dc:date')
    const parsedDate = rawDate ? new Date(rawDate) : null
    const summary = tagContent(itemXml, 'description')

    items.push({
      guid: decodeEntities(tagContent(itemXml, 'guid') ?? cleanLink),
      title: stripHtml(title),
      link: cleanLink,
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      summary: summary ? stripHtml(summary).slice(0, 1000) || null : null,
    })
  }

  return items
}

// ─── Stažení a zápis ──────────────────────────────────────────────────────────

export interface TaxNewsSyncResult {
  fetched: number
  matched: number
  inserted: number
  /** Feedy, které se nepodařilo stáhnout — jeden mrtvý kanál nesmí shodit ostatní */
  failedFeeds: string[]
}

const FETCH_TIMEOUT_MS = 15_000

async function fetchFeed(feed: TaxNewsFeed): Promise<ParsedNewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { 'user-agent': 'ZakazIQ/1.0 (+tax-news)', accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  return parseRssItems(await res.text())
}

/**
 * Stáhne všechny kanály, profiltruje klíčovými slovy a zapíše nové položky.
 *
 * Idempotence stojí na `ON CONFLICT (source, guid) DO NOTHING` — opakovaný
 * běh nad stejným feedem nezaloží duplicity a nepřepíše `read`, takže už
 * přečtená novinka nevyskočí příštím týdnem znovu jako nová.
 */
export async function syncTaxNews(): Promise<TaxNewsSyncResult> {
  const result: TaxNewsSyncResult = { fetched: 0, matched: 0, inserted: 0, failedFeeds: [] }

  const feeds = await Promise.allSettled(TAX_NEWS_FEEDS.map(fetchFeed))

  // Odkaz na tentýž článek chodí z obou kanálů Finanční správy — sesbírat
  // napřed a teprve pak zapisovat, ať se v jednom běhu neřeší sám se sebou.
  const seen = new Set<string>()
  const toInsert: (ParsedNewsItem & { source: TaxNewsSource })[] = []

  feeds.forEach((outcome, i) => {
    const feed = TAX_NEWS_FEEDS[i]

    if (outcome.status === 'rejected') {
      console.error(`[tax-news] ${feed.source}/${feed.label} selhal:`, outcome.reason)
      result.failedFeeds.push(`${feed.source}/${feed.label}`)
      return
    }

    for (const item of outcome.value) {
      result.fetched++
      if (!matchesTaxKeywords(item)) continue
      result.matched++

      const key = `${feed.source}::${item.guid}`
      if (seen.has(key)) continue
      seen.add(key)

      toInsert.push({ ...item, source: feed.source })
    }
  })

  for (const item of toInsert) {
    const rows = await sql`
      INSERT INTO tax_news (source, guid, title, link, published_at, summary)
      VALUES (${item.source}, ${item.guid}, ${item.title}, ${item.link},
              ${item.publishedAt}, ${item.summary})
      ON CONFLICT (source, guid) DO NOTHING
      RETURNING id
    `
    if (rows.length > 0) result.inserted++
  }

  return result
}
