import 'server-only'
import { readFile } from 'fs/promises'
import path from 'path'
import { lookup } from 'dns/promises'
import https from 'https'
import { isIP } from 'net'
import { escapeHtml } from '../security/html'
import { createSemaphore } from '../security/semaphore'
import { itemTotals } from './totals'
import { KIND_TITLES, formatPercent, type InvoiceKind, type Settlement } from '../admin/invoice-kinds'

/**
 * Jedno PDF faktury pro celé repo (AD12).
 *
 * Doklad vypadá stejně, ať ho vystaví firma ve Workspace, nebo Kryštof
 * v adminu — proto tu renderer žije sám, bez vazby na schéma `ws` nebo
 * `public`. Volající si připraví `PdfInvoice`: hotové strany, položky
 * a součty, nic víc.
 *
 * Vzniklo vytažením `lib/ws/money/pdf.ts` (S14), který teď tenhle modul jen
 * volá. Při vytažení se opravily dvě věci, co se na daňovém dokladu pletly:
 * datum bez roku a variabilní symbol, který kvůli překlepu v regulárním
 * výrazu (`/\\D/` místo `/\D/`) zůstával s pomlčkou — zatímco QR kód vedle
 * něj nesl samé číslice.
 *
 * Co se sem nepřesunulo: čtení nahraného PDF (`readPdf`) zůstalo ve
 * Workspace, admin si nahrané PDF ověřuje po svém v `lib/invoices.ts`.
 */

export type PdfParty = {
  name: string
  address: string
  ico?: string | null
  dic?: string | null
  bank?: string | null
}

export type PdfItem = {
  description: string
  quantity: number
  unitPrice: number
  vatRate: number
}

/**
 * Dodavatel. Kromě údajů strany nese, co patří na obchodní listinu podnikatele
 * (§ 435 občanského zákoníku): údaj o zápisu do rejstříku nebo jiné evidence.
 * Volitelná pole chybí u starších snímků faktur — pak se prostě netisknou.
 */
export type PdfIssuer = PdfParty & {
  vatPayer: boolean
  /** Obchodní značka (např. VIZEON). Jméno dodavatele zůstává právní, značka je navíc. */
  tradeName?: string | null
  /** „Fyzická osoba zapsaná v živnostenském rejstříku…“ nebo „zapsaná v obchodním rejstříku…“. */
  registry?: string | null
  email?: string | null
  phone?: string | null
  web?: string | null
}

/** Odběratel. E-mail a telefon jsou nepovinné a tisknou se drobně pod IČO (R-153). */
export type PdfCustomer = PdfParty & {
  email?: string | null
  phone?: string | null
}

export type PdfInvoice = {
  number: string
  issuer: PdfIssuer
  counterparty: PdfCustomer
  issuedOn: string
  /** Datum uskutečnění plnění — tiskne se jen plátci DPH. */
  suppliedOn: string
  dueOn: string
  paidOn: string | null
  amount: number
  currency: 'CZK' | 'EUR'
  items: PdfItem[]
  note: string
  /**
   * Má smysl platit? QR kód se kreslí jen tam, kde peníze ještě nedorazily —
   * ne u zaplacené, stornované ani přijaté faktury. Rozhoduje volající,
   * protože „zaplaceno" se v každém schématu jmenuje jinak.
   */
  payable: boolean
  /** Stornovaný doklad se nesmí tvářit jako platný, i když ho někdo vytiskne. */
  cancelled?: boolean
  /**
   * Druh dokladu a rozpis ceny zakázky (R-143). Bez něj obyčejná „Faktura"
   * — tak se tisknou faktury Workspace a doklady vystavené před R-143.
   */
  document?: PdfDocument | null
}

export type PdfDocument = {
  kind: InvoiceKind
  /** Kolik procent ceny zakázky faktura pokrývá. */
  percent: number | null
  settlement: Settlement | null
}

export type PdfBrand = { name: string; logo: string | null }

const ASSETS = 'lib/invoice-pdf/assets'

/** Logo se stáhne s připnutou veřejnou IPv4, bez redirectů. Chromium nemá síť. */
export function isPublicV4(ip: string): boolean {
  if (isIP(ip) !== 4) return false
  const [a, b] = ip.split('.').map(Number)
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

async function logoData(raw: string | null): Promise<string | null> {
  if (!raw) return null
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('money_logo_url')
  }
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  if (!addresses.length || addresses.some(a => !isPublicV4(a.address))) throw new Error('money_logo_private')
  const address = addresses[0].address
  const data = await new Promise<Buffer>((resolve, reject) => {
    const req = https.get(url, { lookup: (_host, _options, callback) => callback(null, address, 4), timeout: 5000 }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('money_logo_http')); return }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 512 * 1024) { res.destroy(new Error('money_logo_size')); return }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('money_logo_timeout')))
    req.on('error', reject)
  })
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255
  if (!png && !jpeg) throw new Error('money_logo_type')
  return 'data:image/' + (png ? 'png' : 'jpeg') + ';base64,' + data.toString('base64')
}

async function fontCss(): Promise<string> {
  const dir = path.join(process.cwd(), ASSETS)
  const raw = await readFile(path.join(dir, 'fonts.css'), 'utf8')
  const names = Array.from(new Set(Array.from(raw.matchAll(/FONT:([^)]+)/g)).map(m => m[1])))
  let css = raw
  for (const name of names) {
    css = css.replaceAll('FONT:' + name, 'data:font/woff2;base64,' + (await readFile(path.join(dir, name))).toString('base64'))
  }
  return css
}

/**
 * Společný základ stylů pro každý dokument, který se tiskne: paleta Dílků,
 * vložená písma a `extraCss` toho konkrétního dokladu. Používá ji faktura
 * i předávací dokument (AD16), aby nevznikly dvě party písem a barev.
 *
 * Cesty jsou napsané doslova, aby bundler věděl, které dva soubory sbalit —
 * při skládání cesty za běhu by do funkce zabalil celý projekt.
 */
export async function documentStyles(extraCss: string): Promise<string> {
  const tokens = (
    await Promise.all([
      readFile(path.join(process.cwd(), 'app/tokens-dilky.css'), 'utf8'),
      readFile(path.join(process.cwd(), 'app/ws-tokens.css'), 'utf8'),
    ])
  ).join('\n')
  return tokens + (await fontCss()) + extraCss
}

// Escapování do HTML žije v `lib/security/html.ts`; odtud se jen předává dál,
// protože ho importují šablony dalších dokladů.
export { escapeHtml }

/**
 * Chromium, který z HTML udělá PDF. Bez JavaScriptu a bez sítě: pustit se smí
 * jen `data:` URL, takže dokument nemá jak stařit na cizím serveru.
 */
export function renderPdf(html: string): Promise<Buffer> {
  return pdfSlots.run(() => renderPdfNow(html))
}

/**
 * Souběžně smí běžet jen {@link PDF_CONCURRENCY} Chromia na jednu instanci funkce.
 * Každé stojí stovky MB paměti; bez stropu stačí pár souběžných stažení PDF
 * (každé z nich za svým limitem na IP nebo účet), aby instanci zabil nedostatek
 * paměti i s ostatními požadavky, které na ní běží. Čekající se po 25 s vzdají
 * chybou — volající ji stejně jako jiné selhání převedou na hlášku „zkuste později".
 */
const PDF_CONCURRENCY = 2
const pdfSlots = createSemaphore(PDF_CONCURRENCY, 25_000)

async function renderPdfNow(html: string): Promise<Buffer> {
  const puppeteer = (await import('puppeteer-core')).default
  const chromium = process.env.VERCEL ? (await import('@sparticuz/chromium')).default : null
  const browser = await puppeteer.launch({
    executablePath: chromium
      ? await chromium.executablePath(path.join(process.cwd(), 'node_modules/@sparticuz/chromium/bin'))
      : process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: chromium ? chromium.args : [],
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', r => { void (r.url().startsWith('data:') ? r.continue() : r.abort()) })
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, timeout: 20000 }))
  } finally {
    await browser.close()
  }
}

// Vzhled dokladu (R-142): hlavička se značkou dodavatele a druhem dokladu,
// strany v rámečcích, řádek dat, položky s čísly vpravo, souhrn s tmavým
// polem „Celkem k úhradě", platební údaje s QR a patička na každé stránce.
//
// Patička žije v okrajových polích stránky (`@bottom-left`, `@bottom-right`),
// takže je na každé stránce dokladu, ne jen na poslední. Chromium je umí od
// verze 131, na Vercelu běží @sparticuz/chromium 149. Barvy jsou v okraji
// stránky napsané číslem (= token `quiet`): okraj stránky nedědí proměnné
// z `:root`, `var(--quiet)` by tam zůstala prázdná.
export const ZAKAZIQ_FOOTER = 'Vystaveno v systému ZakazIQ · zakaziq.cz'

const FOOTER_MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='9' viewBox='0 0 9 9'%3E" +
  "%3Cg fill='%2323478b'%3E%3Crect width='4' height='4' rx='1'/%3E%3Crect x='5' width='4' height='4' rx='1'/%3E" +
  "%3Crect y='5' width='4' height='4' rx='1'/%3E%3Crect x='5' y='5' width='4' height='4' rx='1'/%3E%3C/g%3E%3C/svg%3E"

const PAGE_BOX = 'font-family:InvoiceSans,sans-serif;font-size:8.5px;color:rgb(74 88 120);vertical-align:top;padding-top:6mm'

// `body[data-app="ws"]`, ne jen `body`: tokeny Workspace nastavují font-family
// na `[data-app="ws"]`, což je sám `<body>` — a `var(--font-instrument-sans)`
// v PDF neexistuje, takže slabší pravidlo prohrálo a dokument se tiskl
// patkovým výchozím písmem prohlížeče. Vložená písma se tím používala jen
// na čísla (AD12).
/**
 * Okraj stránky s patičkou. Číslo faktury jde do řetězce v CSS, proto z něj
 * zůstanou jen znaky, které CSS řetězec nemůžou rozbít (čísluje systém, ale jistota).
 */
function pageCss(invoiceNumber: string): string {
  const safe = invoiceNumber.replace(/[^0-9A-Za-z/-]/g, '').slice(0, 30)
  return '@page{size:A4;margin:15mm 16mm 18mm;' +
    '@bottom-left{content:url("' + FOOTER_MARK + '") "  ' + ZAKAZIQ_FOOTER + '";' + PAGE_BOX + '}' +
    '@bottom-right{content:"Faktura ' + safe + ' · strana " counter(page) " z " counter(pages);' + PAGE_BOX + '}}'
}

const CSS =
  '*{box-sizing:border-box}' +
  'body[data-app="ws"]{font-family:InvoiceSans,sans-serif;font-size:12px;line-height:1.45;color:rgb(var(--ink));background:rgb(var(--surface));margin:0}' +
  'p{margin:0;white-space:pre-line;overflow-wrap:anywhere}' +
  '.num{font-family:InvoiceMono,monospace;font-size:.95em}' +
  '.label{display:block;margin-bottom:6px;font-size:10.5px;font-weight:500;color:rgb(var(--quiet))}' +
  '.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;border-bottom:2px solid rgb(var(--navy-950))}' +
  '.mark{font-size:26px;font-weight:700;letter-spacing:-.025em;line-height:1;color:rgb(var(--navy-950));overflow-wrap:anywhere}' +
  '.mark img{display:block;max-width:180px;max-height:56px}' +
  '.mark-sub{margin-top:6px;font-size:11px;color:rgb(var(--quiet))}' +
  '.doc{text-align:right;flex:none}' +
  '.doc-kind{font-size:21px;font-weight:600;letter-spacing:-.02em;line-height:1.1}' +
  '.doc-no{margin-top:5px;color:rgb(var(--quiet))}' +
  '.doc-no .num{font-size:14px;font-weight:600;color:rgb(var(--ink))}' +
  '.pill{display:inline-block;margin-top:8px;padding:3px 11px;border-radius:999px;font-size:10.5px;font-weight:600}' +
  '.pill-paid{background:rgb(var(--navy-100));color:rgb(var(--navy-900))}' +
  '.pill-void{background:rgb(var(--danger));color:rgb(var(--surface))}' +
  '.void{margin-top:14px;padding:11px 14px;border:1px solid rgb(var(--danger));border-radius:12px;color:rgb(var(--danger));font-weight:600}' +
  '.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}' +
  '.party{padding:14px 16px;border:1px solid rgb(var(--navy-100));border-radius:14px}' +
  '.party strong{display:block;font-size:13.5px}' +
  '.party .trade{font-weight:600;color:rgb(var(--navy-700))}' +
  '.party .ids{margin-top:6px}' +
  '.party .fine{margin-top:8px;font-size:10px;line-height:1.4;color:rgb(var(--quiet))}' +
  '.facts{display:grid;grid-template-columns:repeat(4,1fr);margin-top:16px;border:1px solid rgb(var(--navy-100));border-radius:14px}' +
  '.facts div{padding:9px 14px;border-left:1px solid rgb(var(--navy-100))}' +
  '.facts div:first-child{border-left:0}' +
  '.facts .label{margin-bottom:2px}' +
  'table{border-collapse:collapse;width:100%}' +
  '.items{margin-top:22px}' +
  'th{font-size:10.5px;font-weight:500;color:rgb(var(--quiet));text-align:left;padding:0 8px 7px;border-bottom:1px solid rgb(var(--navy-950))}' +
  'td{padding:9px 8px;border-bottom:1px solid rgb(var(--navy-100));vertical-align:top}' +
  'th:first-child,td:first-child{padding-left:0}th:last-child,td:last-child{padding-right:0}' +
  '.r{text-align:right;white-space:nowrap}' +
  'tr{break-inside:avoid}' +
  '.sum{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:18px;break-inside:avoid}' +
  '.recap th,.recap td{padding-top:5px;padding-bottom:5px}' +
  '.legal{font-size:11px;color:rgb(var(--quiet))}' +
  '.row{display:flex;justify-content:space-between;gap:16px;padding:3px 0}' +
  '.grand{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-top:8px;padding:13px 16px;border-radius:14px;background:rgb(var(--navy-950));color:rgb(var(--surface))}' +
  '.grand span{font-weight:500}' +
  '.grand .num{font-size:19px;font-weight:700}' +
  '.grand-void .num{text-decoration:line-through}' +
  '.grand-note{margin-top:6px;text-align:right;font-size:11px;color:rgb(var(--quiet))}' +
  '.pay{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:20px;padding:14px 16px;border:1px solid rgb(var(--navy-100));border-radius:14px;break-inside:avoid}' +
  '.pay dl{display:grid;grid-template-columns:auto 1fr;gap:5px 18px;margin:0}' +
  '.pay dt{color:rgb(var(--quiet))}.pay dd{margin:0}' +
  '.qr{flex:none;text-align:center;font-size:10px;color:rgb(var(--quiet))}' +
  '.qr svg{display:block;width:118px;height:118px}' +
  '.plan{margin-top:18px;padding:14px 16px;border:1px solid rgb(var(--navy-100));border-radius:14px;break-inside:avoid}' +
  '.bar{display:flex;height:8px;margin:2px 0 12px;border-radius:999px;overflow:hidden;background:rgb(var(--navy-100))}' +
  '.bar i{display:block;height:100%}' +
  '.bar .b-done{background:rgb(var(--navy-950))}.bar .b-open{background:rgb(var(--navy-500))}.bar .b-this{background:rgb(var(--navy-300))}' +
  '.plan .row{border-bottom:1px solid rgb(var(--navy-50))}' +
  '.dot{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:999px;vertical-align:1px}' +
  '.d-done{background:rgb(var(--navy-950))}.d-open{background:rgb(var(--navy-500))}.d-this{background:rgb(var(--navy-300))}.d-rest{background:rgb(var(--navy-100))}' +
  '.plan .row:last-child{border-bottom:0}' +
  '.plan .muted{color:rgb(var(--quiet))}' +
  '.plan .strong{font-weight:600}' +
  '.tail{break-inside:avoid}' +
  '.note{margin-top:20px}' +
  '.contact{margin-top:16px;font-size:10.5px;color:rgb(var(--quiet))}'


const moneyFormatters = new Map<string, Intl.NumberFormat>()

/** „1 249 Kč", „249,50 Kč". Desetinná místa jen tehdy, když nejsou nulová. */
function formatMoney(amount: number, currency: 'CZK' | 'EUR'): string {
  const whole = Math.round(Math.abs(amount) * 100) % 100 === 0
  const key = `${currency}:${whole ? 0 : 2}`
  let formatter = moneyFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
    moneyFormatters.set(key, formatter)
  }
  return formatter.format(amount)
}

/**
 * „9. 10. 2026". Na dokladu musí být rok — Workspace tu dřív tiskl „pá 9. 10."
 * z formátu pro kalendář, takže daňový doklad rok vůbec neuváděl.
 */
function formatDocumentDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return `${day}. ${month}. ${year}`
}

/** Variabilní symbol: jen číslice, nejvýš 10 znaků (pravidlo bankovního styku). */
export function variableSymbol(number: string): string {
  return number.replace(/\D/g, '').slice(0, 10)
}

/**
 * Platební řetězec pro QR (SPAYD 1.0). Vrací `null`, kdykoli si nejsme jistí:
 * jiná měna než koruny, neplatný IBAN nebo faktura, která se už neplatí.
 */
export function spaydPaymentString(invoice: PdfInvoice): string | null {
  if (!invoice.payable || invoice.cancelled || invoice.currency !== 'CZK') return null
  const iban = normalizeIban(invoice.issuer.bank)
  if (!iban) return null
  const vs = variableSymbol(invoice.number)
  return 'SPD*1.0*ACC:' + iban + '*AM:' + invoice.amount.toFixed(2) + '*CC:CZK' + (vs ? '*X-VS:' + vs : '')
}

/**
 * IBAN bez mezer a velkými písmeny, nebo `null`, když to IBAN není nebo nesedí
 * kontrolní číslice. Z neplatného IBANu se nekreslí QR ani tuzemský tvar účtu.
 */
export function normalizeIban(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const iban = raw.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || iban.length > 34) return null
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1 ? iban : null
}

/**
 * Tuzemský tvar českého účtu z IBANu: „19-2000145399/0800". Český IBAN má po
 * kódu banky šest číslic předčíslí a deset číslic čísla účtu, obojí s nulami
 * zleva. Klienti v Česku tenhle tvar znají a opisují ho do bankovnictví.
 */
export function czechAccountFromIban(iban: string): string | null {
  if (!/^CZ\d{22}$/.test(iban)) return null
  const bank = iban.slice(4, 8)
  const prefix = iban.slice(8, 14).replace(/^0+/, '')
  const number = iban.slice(14).replace(/^0+/, '')
  if (!number) return null
  return (prefix ? prefix + '-' : '') + number + '/' + bank
}

const quantityFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 3 })
const round2 = (n: number) => Math.round(n * 100) / 100

/** Rekapitulace DPH po sazbách — na daňovém dokladu musí být základ a daň zvlášť pro každou sazbu. */
export function vatRecap(items: PdfItem[]): { rate: number; net: number; vat: number; total: number }[] {
  const byRate = new Map<number, { net: number; vat: number; total: number }>()
  for (const item of items) {
    const t = itemTotals(item)
    const sum = byRate.get(item.vatRate) ?? { net: 0, vat: 0, total: 0 }
    byRate.set(item.vatRate, { net: round2(sum.net + t.net), vat: round2(sum.vat + t.vat), total: round2(sum.total + t.total) })
  }
  return Array.from(byRate.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, sums]) => ({ rate, ...sums }))
}

/**
 * Faktura jako HTML pro Chromium (R-142). Obsahuje všechno, co doklad v Česku
 * mít musí:
 *
 * - označení a číslo dokladu, datum vystavení a datum uskutečnění plnění
 *   (zákon o účetnictví § 11; u plátce i zákon o DPH § 29),
 * - dodavatele a odběratele se jménem, adresou, IČO a DIČ, u dodavatele navíc
 *   údaj o zápisu do rejstříku nebo jiné evidence (občanský zákoník § 435),
 * - předmět plnění, množství, cenu za kus a částku,
 * - u plátce DPH „daňový doklad", sazbu u položek a rekapitulaci základu
 *   a daně po sazbách; u neplátce větu, že plátcem DPH není.
 *
 * Navíc, aby se dalo pohodlně zaplatit: splatnost, variabilní symbol, účet
 * v tuzemském tvaru i jako IBAN a QR platba. Stornovaný a zaplacený doklad to
 * mají napsané nahoře i v souhrnu, aby je nikdo nezaplatil podruhé.
 */
export async function invoiceHtml(invoice: PdfInvoice, brand: PdfBrand): Promise<string> {
  let logo: string | null = null
  try {
    logo = await logoData(brand.logo)
  } catch {
    console.warn('[invoice-pdf] Logo se do PDF nepodařilo načíst.')
  }
  // Uživatelské hodnoty se serializují pouze jako escapovaný text, nikdy HTML.
  const text = escapeHtml
  const issuer = invoice.issuer
  const vat = issuer.vatPayer
  const cancelled = invoice.cancelled === true
  const paid = !cancelled && invoice.paidOn !== null
  const amount = (n: number) => text(formatMoney(n, invoice.currency))
  const num = (value: string) => '<span class="num">' + text(value) + '</span>'
  const date = (iso: string) => num(formatDocumentDate(iso))
  const filled = (value: string | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : '')
  const vs = variableSymbol(invoice.number)
  const tradeName = filled(issuer.tradeName)
  const iban = normalizeIban(issuer.bank)
  const czechAccount = iban ? czechAccountFromIban(iban) : null
  const rawBank = filled(issuer.bank)

  // ─── Druh dokladu (R-143) ───
  // Zálohová faktura není daňový doklad ani u plátce DPH — ten vzniká až po
  // přijetí platby. Plnění u ní ještě neproběhlo, takže datum plnění nemá.
  const doc = invoice.document ?? null
  const kind: InvoiceKind = doc?.kind ?? 'single'
  const deposit = kind === 'deposit'
  const docTitle = KIND_TITLES[kind] + (vat && !deposit ? ' – daňový doklad' : '')

  // ─── Hlavička: značka dodavatele vlevo, druh a číslo dokladu vpravo ───
  const wordmark = tradeName || brand.name || issuer.name
  const markSub = filled(issuer.web)
  const head =
    '<header class="head"><div>' +
    '<div class="mark">' + (logo ? '<img alt="' + text(wordmark) + '" src="' + logo + '">' : text(wordmark)) + '</div>' +
    (markSub ? '<p class="mark-sub">' + text(markSub) + '</p>' : '') +
    '</div><div class="doc">' +
    '<div class="doc-kind">' + text(docTitle) + '</div>' +
    '<p class="doc-no">č. ' + num(invoice.number) + '</p>' +
    (cancelled ? '<span class="pill pill-void">Stornováno</span>' : paid ? '<span class="pill pill-paid">Zaplaceno</span>' : '') +
    '</div></header>'

  const voidBanner = cancelled
    ? '<p class="void">Tento doklad byl stornován a neplatí. Nic neplaťte.</p>'
    : ''

  // ─── Strany ───
  const ids = (p: PdfParty) =>
    (p.ico ? '<p>IČO ' + num(p.ico) + '</p>' : '') +
    (p.dic ? '<p>DIČ ' + num(p.dic) + '</p>' : '')
  const contact = [filled(issuer.email), filled(issuer.phone), filled(issuer.web)].filter(Boolean)
  const supplier =
    '<section class="party"><span class="label">Dodavatel</span>' +
    '<strong>' + text(issuer.name) + '</strong>' +
    (tradeName && tradeName !== issuer.name ? '<p class="trade">' + text(tradeName) + '</p>' : '') +
    '<p>' + text(issuer.address) + '</p>' +
    '<div class="ids">' + ids(issuer) + '</div>' +
    (filled(issuer.registry) ? '<p class="fine">' + text(filled(issuer.registry)) + '</p>' : '') +
    (contact.length ? '<p class="fine">' + contact.map(text).join(' · ') + '</p>' : '') +
    '</section>'
  const customerContact = [filled(invoice.counterparty.email), filled(invoice.counterparty.phone)].filter(Boolean)
  const customer =
    '<section class="party"><span class="label">Odběratel</span>' +
    '<strong>' + text(invoice.counterparty.name) + '</strong>' +
    (invoice.counterparty.address ? '<p>' + text(invoice.counterparty.address) + '</p>' : '') +
    '<div class="ids">' + ids(invoice.counterparty) + '</div>' +
    (customerContact.length ? '<p class="fine">' + customerContact.map(text).join(' · ') + '</p>' : '') +
    '</section>'

  // ─── Data dokladu ───
  const fact = (label: string, value: string) => '<div><span class="label">' + label + '</span>' + value + '</div>'
  const facts =
    '<div class="facts">' +
    fact('Datum vystavení', date(invoice.issuedOn)) +
    (deposit
      ? fact('Záloha', doc?.percent ? num(formatPercent(doc.percent) + ' % ceny') : '—')
      : fact('Datum uskutečnění plnění', date(invoice.suppliedOn || invoice.issuedOn))) +
    fact('Datum splatnosti', date(invoice.dueOn)) +
    fact('Variabilní symbol', vs ? num(vs) : '—') +
    '</div>'

  // ─── Položky ───
  const head2 =
    '<tr><th>Popis</th><th class="r">Množství</th>' +
    (vat
      ? '<th class="r">Cena za kus bez DPH</th><th class="r">Sazba DPH</th><th class="r">Celkem bez DPH</th>'
      : '<th class="r">Cena za kus</th><th class="r">Celkem</th>') +
    '</tr>'
  const rows = invoice.items
    .map(i => {
      const t = itemTotals(i)
      return '<tr><td>' + text(i.description) + '</td>' +
        '<td class="r">' + num(quantityFormatter.format(i.quantity)) + '</td>' +
        '<td class="r">' + num(formatMoney(i.unitPrice, invoice.currency)) + '</td>' +
        (vat ? '<td class="r">' + num(i.vatRate + ' %') + '</td><td class="r">' + num(formatMoney(t.net, invoice.currency)) + '</td>'
             : '<td class="r">' + num(formatMoney(t.total, invoice.currency)) + '</td>') +
        '</tr>'
    })
    .join('')
  const items = '<table class="items"><thead>' + head2 + '</thead><tbody>' + rows + '</tbody></table>'

  // ─── Souhrn ───
  const recap = vat ? vatRecap(invoice.items) : []
  const left = vat
    ? '<table class="recap"><thead><tr><th>Sazba DPH</th><th class="r">Základ daně</th><th class="r">DPH</th><th class="r">Celkem</th></tr></thead><tbody>' +
      recap.map(r => '<tr><td>' + num(r.rate + ' %') + '</td><td class="r">' + num(formatMoney(r.net, invoice.currency)) +
        '</td><td class="r">' + num(formatMoney(r.vat, invoice.currency)) + '</td><td class="r">' + num(formatMoney(r.total, invoice.currency)) + '</td></tr>').join('') +
      '</tbody></table>'
    : '<p class="legal">Dodavatel není plátcem DPH.</p>'
  const legalDeposit = deposit ? '<p class="legal">Zálohová faktura není daňový doklad.</p>' : ''
  const netSum = round2(recap.reduce((s, r) => s + r.net, 0))
  const vatSum = round2(recap.reduce((s, r) => s + r.vat, 0))
  const grandLabel = cancelled ? 'Stornováno' : paid ? 'Zaplaceno' : invoice.payable ? 'Celkem k úhradě' : 'Celkem'
  const right =
    '<div>' +
    (vat
      ? '<div class="row"><span>Celkem bez DPH</span>' + num(formatMoney(netSum, invoice.currency)) + '</div>' +
        '<div class="row"><span>DPH</span>' + num(formatMoney(vatSum, invoice.currency)) + '</div>'
      : '') +
    '<div class="grand' + (cancelled ? ' grand-void' : '') + '"><span>' + grandLabel + '</span>' + num(formatMoney(invoice.amount, invoice.currency)) + '</div>' +
    (paid && invoice.paidOn ? '<p class="grand-note">Uhrazeno ' + date(invoice.paidOn) + '</p>' : '') +
    (cancelled ? '<p class="grand-note">Doklad neplatí, částka se nehradí.</p>' : '') +
    '</div>'
  const summary = '<section class="sum"><div>' + left + legalDeposit + '</div>' + right + '</section>'

  // ─── Rozpis ceny zakázky (R-143): co je hotové, tahle faktura, co zbývá ───
  let plan = ''
  const st = doc?.settlement
  if (st && st.price > 0 && invoice.currency === 'CZK') {
    const money = (n: number) => num(formatMoney(n, 'CZK'))
    const width = (part: number) => Math.max(0, Math.min(100, (part / st.price) * 100)).toFixed(2) + '%'
    const done = st.paidOutside + st.invoices.filter(i => i.paid).reduce((sum, i) => sum + i.amount, 0)
    const open = st.invoices.filter(i => !i.paid).reduce((sum, i) => sum + i.amount, 0)
    const row = (label: string, value: string, cls = '', dot = '') =>
      '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + (dot ? '<i class="dot ' + dot + '"></i>' : '') + label + '</span>' + value + '</div>'
    plan =
      '<section class="plan"><span class="label">Rozpis ceny zakázky</span>' +
      '<div class="bar" aria-hidden="true">' +
      '<i class="b-done" style="width:' + width(done) + '"></i>' +
      '<i class="b-open" style="width:' + width(open) + '"></i>' +
      '<i class="b-this" style="width:' + width(st.thisAmount) + '"></i>' +
      '</div>' +
      row('Cena zakázky celkem', money(st.price), 'strong') +
      st.invoices.map(i =>
        row(
          text((i.kind ? KIND_TITLES[i.kind] : 'Faktura') + ' ' + i.number) + ' <span class="muted">· ' + (i.paid ? 'uhrazeno' : 'čeká na úhradu') + '</span>',
          money(i.amount),
          '',
          i.paid ? 'd-done' : 'd-open',
        ),
      ).join('') +
      (st.paidOutside > 0 ? row('Zálohy uhrazené bez faktury', money(st.paidOutside), '', 'd-done') : '') +
      row('Tato faktura · ' + text(formatPercent(st.thisPercent)) + ' %', money(st.thisAmount), 'strong', 'd-this') +
      row('Zbývá k fakturaci', money(st.remainingAfter), '', 'd-rest') +
      '</section>'
  }

  // ─── Platební údaje: jen když se ještě platí ───
  let payment = ''
  if (invoice.payable && !cancelled) {
    const spayd = spaydPaymentString(invoice)
    let qr = ''
    if (spayd) {
      // Ne qrcode.react: route handlery běží s React serverovým buildem bez hooků (R-064).
      const QRCode = (await import('qrcode')).default
      qr = await QRCode.toString(spayd, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 118 })
    }
    const line = (label: string, value: string) => '<dt>' + label + '</dt><dd>' + value + '</dd>'
    const lines =
      (rawBank ? line('Způsob úhrady', 'Převodem na účet') : '') +
      (czechAccount ? line('Číslo účtu', num(czechAccount)) : '') +
      (iban ? line('IBAN', num(iban.replace(/(.{4})/g, '$1 ').trim())) : rawBank ? line('Číslo účtu', num(rawBank)) : '') +
      (vs ? line('Variabilní symbol', num(vs)) : '') +
      line('Částka', num(formatMoney(invoice.amount, invoice.currency))) +
      line('Splatnost', date(invoice.dueOn))
    payment =
      '<section class="pay"><div><span class="label">Platební údaje</span><dl>' + lines + '</dl></div>' +
      (qr ? '<div class="qr">' + qr + 'QR platba</div>' : '') +
      '</section>'
  }

  const note = filled(invoice.note) ? '<p class="note">' + text(filled(invoice.note)) + '</p>' : ''

  return '<!doctype html><html lang="cs"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src ' + text("'none'") + '; img-src data:; font-src data:; style-src ' + text("'unsafe-inline'") + '">' +
    '<title>' + text(KIND_TITLES[kind] + ' ' + invoice.number) + '</title>' +
    '<style>' + (await documentStyles(pageCss(invoice.number) + CSS)) + '</style></head><body data-app="ws">' +
    head + voidBanner +
    '<div class="parties">' + supplier + customer + '</div>' +
    facts + items + plan + summary +
    // Platební údaje a poznámka drží spolu, ať poznámka nespadne sama na další stránku.
    (payment || note ? '<div class="tail">' + payment + note + '</div>' : '') +
    '</body></html>'
}

export async function renderInvoicePdf(invoice: PdfInvoice, brand: PdfBrand): Promise<Buffer> {
  return renderPdf(await invoiceHtml(invoice, brand))
}
