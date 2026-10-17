// Novinky ZakazIQ (S17): štítky, limity, kontrola obrázku a tipy „Učesat text“.
// Bez importů serveru — používá ho editor v adminu i zvonek v aplikaci.

export const NEWS_TAGS = ['new', 'improvement', 'fix'] as const
export type NewsTag = (typeof NEWS_TAGS)[number]

export const NEWS_TAG_LABELS: Record<NewsTag, string> = {
  new: 'Nové',
  improvement: 'Vylepšení',
  fix: 'Oprava',
}

export const isNewsTag = (v: unknown): v is NewsTag => typeof v === 'string' && (NEWS_TAGS as readonly string[]).includes(v)

/** Shodné s CHECK v migracích 081 a 083. */
export const NEWS_LIMITS = { title: 120, body: 2000, link: 500, imageBytes: 600 * 1024 } as const

export type NewsImageType = 'image/png' | 'image/jpeg' | 'image/webp'

/**
 * Typ obrázku podle prvních bajtů, ne podle přípony nebo hlavičky z prohlížeče.
 * SVG ani nic jiného neprojde (SVG může nést skript).
 */
export function sniffImageType(bytes: Uint8Array): NewsImageType | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp'
  return null
}

/** Odkaz novinky: jen https (CHECK v DB). Vrací normalizovanou adresu nebo null. */
export function normalizeNewsLink(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export type TextHint = { id: string; message: string }

// „Učesat text“ (R-052, jen v adminu — tyká): jen návod podle skillu humanize-text-cs, žádné AI volání.
// Hledá vzorce, podle kterých lidé poznají strojový text, a říká, co s nimi.
// Hranice slova podle Unicode (\b v JS zná jen ASCII, „nicméně“ by nenašel).
const word = (pattern: string) => new RegExp(`(?<!\\p{L})(?:${pattern})(?!\\p{L})`, 'iu')

const PHRASES: { re: RegExp; message: string }[] = [
  { re: word('nicméně'), message: '„nicméně“ zní strojově, stačí „ale“.' },
  { re: word('v neposlední řadě'), message: '„v neposlední řadě“ nahraď „a taky“.' },
  { re: word('je (?:důležité|třeba) (?:poznamenat|zmínit|zdůraznit)'), message: '„je důležité poznamenat“ se dá vynechat, řekni to rovnou.' },
  { re: word('nejde jen o'), message: 'Vazbu „nejde jen o…, ale i o…“ přepiš přímo.' },
  { re: word('(?:klíčov|zásadn)\\p{L}*'), message: '„klíčový / zásadní“ často jde vynechat nebo napsat „hlavní“.' },
  { re: word('revoluční|inovativní|bezproblémov\\p{L}*|komplexní|posun\\p{L}* na (?:další|novou) úroveň'), message: 'Reklamní slova (revoluční, inovativní, komplexní) vynech a napiš, co se změnilo.' },
  { re: word('(?:s radostí|s potěšením) (?:oznamujeme|vám představujeme)'), message: 'Úvod „s radostí oznamujeme“ vynech a začni tím, co je nové.' },
  { re: word('dejte (?:nám|mi) vědět|neváhejte nás kontaktovat'), message: 'Závěrečná nabídka pomoci je zbytečná, text může skončit dřív.' },
  { re: word('nadto'), message: '„nadto“ nahraď „a taky“ nebo „k tomu“.' },
]

/** Tipy k nadpisu a textu novinky. Prázdné pole = nic nápadného. */
export function newsTextHints(title: string, body: string): TextHint[] {
  const text = `${title}\n${body}`
  const hints: TextHint[] = []
  if (/\s[–—]\s|[^\s\d]—[^\s\d]/.test(text)) {
    hints.push({ id: 'dash', message: 'Dlouhá pomlčka uprostřed věty působí strojově. Rozděl větu nebo použij čárku.' })
  }
  PHRASES.forEach((p, i) => {
    if (p.re.test(text)) hints.push({ id: `phrase-${i}`, message: p.message })
  })
  if (/\*\*[^*]+\*\*/.test(text)) {
    hints.push({ id: 'bold', message: 'Hvězdičky se nezobrazí jako tučné písmo. Smaž je.' })
  }
  const bullets = body.split('\n').filter((l) => /^\s*([-•*]|\d+\.)\s/.test(l)).length
  if (bullets >= 3) {
    hints.push({ id: 'bullets', message: 'Krátká novinka se čte líp jako dvě tři věty než jako seznam.' })
  }
  const sentences = body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  if (sentences.some((s) => s.split(/\s+/).length > 28)) {
    hints.push({ id: 'long', message: 'Některá věta je moc dlouhá. Rozděl ji na dvě.' })
  }
  if (title.trim().endsWith('.')) {
    hints.push({ id: 'title-dot', message: 'Nadpis bez tečky na konci.' })
  }
  return hints
}

/** Obecný návod pod tlačítkem „Učesat text“ (vždy vidět, i když tipy nic nenajdou). */
export const NEWS_STYLE_GUIDE: readonly string[] = [
  'Začni tím, co se pro klienta mění. Bez úvodu typu „s radostí oznamujeme“.',
  'Klientům vykej a piš obyčejnou češtinou, jako bys to říkal u pultu.',
  'Věty různě dlouhé, raději kratší. Žádné pomlčky místo spojek.',
  'Žádné seznamy tří věcí za sebou a žádná reklamní slova.',
  'Jedna novinka = jedna změna. Odkaz jen tam, kde je co dál číst.',
]
