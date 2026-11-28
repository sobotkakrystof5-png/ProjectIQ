// Jediné místo, kudy se cizí text dostává do HTML, atributu, JSON ve skriptu
// nebo do odkazu. Dřív měl repo pět vlastních kopií `escapeHtml` a dvě z nich
// neescapovaly uvozovky — v atributu pak stačilo `"` a text se stal atributem.
// Test `xss-guard.test.ts` hlídá, že další kopie nevzniká.
//
// Modul je čistý (žádné `server-only`, žádný Node), takže ho smí importovat
// i klientská komponenta.

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Text do HTML — obsah elementu i hodnota atributu v uvozovkách. Escapuje
 * `& < > " '`, takže stejná funkce platí v obou kontextech. `null` a `undefined`
 * jsou prázdný řetězec, ostatní hodnoty se převedou na text.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]!)
}

export type SafeUrlOptions = {
  /** Jen `https:` (výchozí je `http:` i `https:`). */
  httpsOnly?: boolean
  /** Povolí `https://uzivatel:heslo@host/` (výchozí ne — typický trik pro phishing). */
  allowCredentials?: boolean
}

/**
 * `true`, když je hodnota absolutní http(s) adresa bez řídicích znaků.
 * Nemění ji (na rozdíl od `safeHttpUrl` nenormalizuje), takže se hodí tam, kde
 * se původní řetězec dál ukládá nebo porovnává — např. jako klíč v databázi.
 */
export function isSafeHttpUrl(value: unknown, options: SafeUrlOptions = {}): boolean {
  return parseSafeUrl(value, options) !== null
}

/**
 * Adresa, kterou smí aplikace vykreslit jako odkaz, nebo `null`. Pouští jen
 * `http:` a `https:` — `javascript:`, `data:`, `vbscript:` ani `file:` ne.
 * Vrací normalizovaný tvar z `URL`, který je bezpečný i do atributu `href`.
 *
 * CSP (bez `unsafe-inline` ve skriptech) a React 19 `javascript:` odkaz
 * zablokují taky; tohle je třetí vrstva, která na prohlížeč nespoléhá.
 */
export function safeHttpUrl(value: unknown, options: SafeUrlOptions = {}): string | null {
  return parseSafeUrl(value, options)?.toString() ?? null
}

function parseSafeUrl(value: unknown, options: SafeUrlOptions): URL | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  // Tabulátor, nový řádek a další řídicí znaky parser URL tiše maže, takže
  // `java\tscript:` by se u zjednodušené kontroly mohl tvářit jako `javascript:`.
  // eslint-disable-next-line no-control-regex
  if (trimmed === '' || trimmed.length > 2048 || /[\u0000-\u001f\u007f]/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  const allowed = options.httpsOnly ? url.protocol === 'https:' : url.protocol === 'https:' || url.protocol === 'http:'
  if (!allowed) return null
  if (!options.allowCredentials && (url.username !== '' || url.password !== '')) return null
  if (url.hostname === '') return null
  return url
}

/**
 * Text s klikacími odkazy jako HTML. Odkazy se hledají v SUROVÉM textu a každý
 * díl se escapuje zvlášť. Opačné pořadí (nejdřív escapovat celé, pak nahrazovat
 * adresy) dosadí do `href` i to, co escapování zanechalo — `&quot;` v adrese —
 * a v prvních verzích dokonce neescapovaná uvozovka ukončila atribut a vložila nový.
 * Odkaz dostane jen adresa, která projde `safeHttpUrl`; zbytek zůstane prostým textem.
 *
 * `linkStyle` je hodnota atributu `style` odkazu (kód, ne uživatelský vstup — i tak se escapuje).
 */
export function linkifyHtml(text: string, linkStyle: string): string {
  let html = ''
  let last = 0
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    // Tečka, čárka nebo závorka na konci věty k adrese nepatří.
    const raw = match[0].replace(/[.,;:!?)\]]+$/, '')
    const href = safeHttpUrl(raw)
    html += escapeHtml(text.slice(last, match.index))
    html += href
      ? `<a href="${escapeHtml(href)}" style="${escapeHtml(linkStyle)}">${escapeHtml(raw)}</a>`
      : escapeHtml(raw)
    last = (match.index ?? 0) + raw.length
  }
  return html + escapeHtml(text.slice(last))
}

/**
 * Text rozdělený na obyčejné části a odkazy — pro React, kde se nic
 * neskládá do HTML. Stejné pravidlo jako `linkifyHtml`: jen http(s),
 * interpunkce na konci věty k adrese nepatří, nebezpečná adresa zůstane textem.
 */
export type TextPart = { text: string; href?: string }

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const raw = match[0].replace(/[.,;:!?)\]]+$/, '')
    const href = safeHttpUrl(raw)
    const start = match.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push(href ? { text: raw, href } : { text: raw })
    last = start + raw.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/**
 * JSON, který se vkládá doprostřed `<script>` (JSON-LD, počáteční data).
 * `JSON.stringify` sám neescapuje `<`, takže `</script>` v hodnotě by
 * skript ukončil a zbytek by se vykreslil jako HTML. Escapuje se `< > &`
 * a také U+2028/U+2029, které ve starších enginech ukončují řetězcový literál.
 */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Hodnota do hlavičky, předmětu e-mailu nebo řádku ICS: bez CR/LF a dalších
 * řídicích znaků, jinak by šlo vložit novou hlavičku (CRLF injection).
 */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim()
}
