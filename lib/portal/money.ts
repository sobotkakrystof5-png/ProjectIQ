import 'server-only'
import { z } from 'zod'
import { createHash } from 'crypto'
import { invoiceState, type InvoiceState } from '@/lib/invoice-status'
import { getPragueTodayISO } from '@/lib/prague-time'
import { spaydPaymentString, variableSymbol, type PdfDocument, type PdfInvoice } from '@/lib/invoice-pdf/render'
import { INVOICE_KINDS, KIND_TITLES } from '@/lib/admin/invoice-kinds'
import { portalDb, pq, type PortalRow } from './db'
import { pgDate } from '@/lib/pg-date'

// Peníze a faktury zakázky v klientském prostoru (KP13, migrace 122, R-125).
// Čte jen projekce portal.project_money a portal.invoices přes portalDb(clientId)
// — RLS a výslovný filtr client_id. Výpočet „zbývá" dělá databáze stejně jako
// admin; tady se jen skládá, co se ukáže. Bez migrace nebo bez práv se vrátí
// prázdno a stránka vypadá jako dřív.

export interface PortalMoney {
  price: number
  paid: number
  remaining: number
  currency: 'CZK'
}

export type PortalInvoiceKind = 'issued' | 'archived'

export interface PortalInvoice {
  id: string
  number: string
  /** Nadpis jako na PDF: Zálohová faktura, Částečná faktura… (R-143). */
  title: string
  kind: PortalInvoiceKind
  issuedOn: string
  dueOn: string | null
  paidOn: string | null
  amount: number
  currency: string
  state: InvoiceState
  /** Jde stáhnout PDF: vystavená se vyrobí z projekce, archivní má nahrané. */
  hasPdf: boolean
  /** Platební údaje pro QR — jen nezaplacená, nestornovaná, v Kč, s platným IBANem. */
  payment: { spayd: string; account: string; variableSymbol: string } | null
}

const TOLERATED = new Set(['42P01', '42501'])

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

const day = (v: unknown): string | null => pgDate(v)
const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Tvar snímku ověřuje aplikace — migrace hodnoty z jsonb záměrně nepřetypovává,
// aby nikdy neshodila zápis faktury v adminu.
const itemSchema = z.object({
  description: z.string().max(500),
  quantity: z.coerce.number().finite(),
  unitPrice: z.coerce.number().finite(),
  vatRate: z.coerce.number().finite().default(0),
})
const issuerSchema = z.object({
  name: z.string().max(160),
  address: z.string().max(400),
  ico: z.string().max(20).nullish(),
  dic: z.string().max(20).nullish(),
  bank: z.string().max(40).nullish(),
  vatPayer: z.boolean().nullish(),
  // R-142, migrace 131. Starší projekce je nemají. E-mail a telefon dodavatele
  // do prostoru nejdou (DECISIONS #042).
  tradeName: z.string().max(80).nullish(),
  registry: z.string().max(300).nullish(),
  web: z.string().max(120).nullish(),
})
const customerSchema = z.object({
  name: z.string().max(300).nullish(),
  address: z.string().max(600).nullish(),
  ico: z.string().max(20).nullish(),
  dic: z.string().max(20).nullish(),
  // Kontakt odběratele z faktury (R-153, migrace 140) — klientovy vlastní údaje.
  email: z.string().max(254).nullish(),
  phone: z.string().max(40).nullish(),
})

/**
 * Druh dokladu a rozpis ceny zakázky (R-143, migrace 133). Čte se přes
 * `to_jsonb(i)`, aby dotaz fungoval i na databázi bez migrace 133.
 */
const documentSchema = z.object({
  kind: z.enum(INVOICE_KINDS),
  percent: z.coerce.number().finite().nullish(),
  settlement: z.object({
    price: z.coerce.number().finite(),
    paidOutside: z.coerce.number().finite().default(0),
    thisAmount: z.coerce.number().finite(),
    thisPercent: z.coerce.number().finite(),
    remainingAfter: z.coerce.number().finite(),
    invoices: z.array(z.object({
      number: z.string().max(40),
      kind: z.enum(INVOICE_KINDS).nullish(),
      amount: z.coerce.number().finite(),
      paid: z.boolean(),
    })).max(50).default([]),
  }).nullish(),
})

export const INVOICE_COLUMNS = `i.id, i.number, i.kind, i.issued_on, i.supplied_on, i.due_on, i.paid_on, i.cancelled_at, i.amount, i.vat_total,
  i.currency, i.items, i.issuer, i.customer, i.printed_note, i.has_pdf, i.pdf_md5, to_jsonb(i)->'document' AS document`

/**
 * Projekce vystavené faktury ve tvaru sdíleného rendereru. `null`, když snímek
 * nesedí na očekávaný tvar — pak se PDF ani QR nenabízí, nic se nehádá.
 */
export function pdfInvoiceFromRow(row: PortalRow): PdfInvoice | null {
  if (row.kind !== 'issued') return null
  const items = z.array(itemSchema).min(1).max(50).safeParse(row.items)
  const issuer = issuerSchema.safeParse(row.issuer)
  const customer = customerSchema.safeParse(row.customer ?? {})
  if (!items.success || !issuer.success || !customer.success) return null
  const issuedOn = day(row.issued_on) ?? ''
  const currency = row.currency === 'EUR' ? 'EUR' : row.currency === 'CZK' ? 'CZK' : null
  if (!issuedOn || !currency) return null
  return {
    number: String(row.number),
    issuer: {
      name: issuer.data.name,
      address: issuer.data.address,
      ico: issuer.data.ico ?? null,
      dic: issuer.data.dic ?? null,
      bank: issuer.data.bank ?? null,
      vatPayer: issuer.data.vatPayer === true,
      tradeName: issuer.data.tradeName ?? null,
      registry: issuer.data.registry ?? null,
      web: issuer.data.web ?? null,
    },
    counterparty: {
      name: customer.data.name ?? '',
      address: customer.data.address ?? '',
      ico: customer.data.ico ?? null,
      dic: customer.data.dic ?? null,
      email: customer.data.email ?? null,
      phone: customer.data.phone ?? null,
    },
    issuedOn,
    suppliedOn: day(row.supplied_on) ?? issuedOn,
    dueOn: day(row.due_on) ?? issuedOn,
    paidOn: day(row.paid_on),
    amount: num(row.amount),
    currency,
    items: items.data,
    note: row.printed_note == null ? '' : String(row.printed_note),
    payable: row.paid_on == null && row.cancelled_at == null,
    cancelled: row.cancelled_at != null,
    document: pdfDocument(row.document),
  }
}

function pdfDocument(raw: unknown): PdfDocument | null {
  const parsed = documentSchema.safeParse(raw)
  if (!parsed.success) return null
  const st = parsed.data.settlement
  return {
    kind: parsed.data.kind,
    percent: parsed.data.percent ?? null,
    settlement: st
      ? { ...st, invoices: st.invoices.map(i => ({ number: i.number, kind: i.kind ?? null, amount: i.amount, paid: i.paid })) }
      : null,
  }
}

export function invoiceFromRow(row: PortalRow, todayIso: string): PortalInvoice {
  const kind: PortalInvoiceKind = row.kind === 'issued' ? 'issued' : 'archived'
  const pdf = kind === 'issued' ? pdfInvoiceFromRow(row) : null
  const spayd = pdf ? spaydPaymentString(pdf) : null
  return {
    id: String(row.id),
    number: String(row.number),
    title: pdf?.document ? KIND_TITLES[pdf.document.kind] : 'Faktura',
    kind,
    issuedOn: day(row.issued_on) ?? '',
    dueOn: day(row.due_on),
    paidOn: day(row.paid_on),
    amount: num(row.amount),
    currency: String(row.currency),
    state: invoiceState(
      { paid_on: day(row.paid_on), due_on: day(row.due_on), cancelled_at: row.cancelled_at == null ? null : String(row.cancelled_at) },
      todayIso,
    ),
    hasPdf: kind === 'issued' ? pdf !== null : row.has_pdf === true,
    payment:
      pdf && spayd
        ? { spayd, account: String(pdf.issuer.bank ?? '').replace(/\s/g, '').toUpperCase(), variableSymbol: variableSymbol(pdf.number) }
        : null,
  }
}

export async function loadClientMoney(
  clientId: string,
  projectId: string,
): Promise<{ money: PortalMoney | null; invoices: PortalInvoice[] }> {
  let moneyRows: PortalRow[]
  let invoiceRows: PortalRow[]
  try {
    ;[moneyRows, invoiceRows] = await portalDb({ clientId }).batch([
      pq`SELECT price, paid, remaining FROM portal.project_money
         WHERE client_id = ${clientId} AND project_id = ${projectId}`,
      {
        text: `SELECT ${INVOICE_COLUMNS} FROM portal.invoices i
               WHERE i.client_id = $1 AND i.project_id = $2 ORDER BY i.issued_on DESC, i.number DESC`,
        params: [clientId, projectId],
      },
    ])
  } catch (err) {
    const code = pgCode(err) ?? ''
    // 42501 = migrace 122 proběhla, ale chybí práva z portal-grants.sql — ať se to pozná.
    if (code === '42501') console.error('[klient] peníze: portal_app nemá práva, pusťte scripts/portal-create-role.js')
    if (TOLERATED.has(code)) return { money: null, invoices: [] }
    throw err
  }
  const todayIso = getPragueTodayISO()
  const m = moneyRows[0]
  const price = m ? num(m.price) : 0
  return {
    // Bez ceny není co ukazovat — „zaplaceno 0 z 0" by klienta jen mátlo.
    money: m && price > 0 ? { price, paid: num(m.paid), remaining: num(m.remaining), currency: 'CZK' } : null,
    invoices: invoiceRows.map((r) => invoiceFromRow(r, todayIso)),
  }
}

export type ClientInvoiceDoc =
  | { kind: 'issued'; number: string; etag: string; invoice: PdfInvoice }
  | { kind: 'archived'; number: string; etag: string }

/**
 * Jedna faktura pro stažení PDF. ETag nese obsah dokladu (u vystavené celý
 * snímek včetně zaplacení a storna, u archivní otisk nahraného PDF), takže
 * opakované otevření nespouští Chromium ani nečte bajty znovu.
 */
export async function loadClientInvoiceDoc(clientId: string, invoiceId: string): Promise<ClientInvoiceDoc | null> {
  let rows: PortalRow[]
  try {
    rows = await portalDb({ clientId })<PortalRow>`
      SELECT i.id, i.number, i.kind, i.issued_on, i.supplied_on, i.due_on, i.paid_on, i.cancelled_at, i.amount, i.vat_total,
             i.currency, i.items, i.issuer, i.customer, i.printed_note, i.has_pdf, i.pdf_md5,
             to_jsonb(i)->'document' AS document
      FROM portal.invoices i WHERE i.client_id = ${clientId} AND i.id = ${invoiceId}
    `
  } catch (err) {
    if (TOLERATED.has(pgCode(err) ?? '')) return null
    throw err
  }
  const row = rows[0]
  if (!row) return null
  const number = String(row.number)
  if (row.kind === 'issued') {
    const invoice = pdfInvoiceFromRow(row)
    if (!invoice) return null
    const etag = createHash('sha256').update(JSON.stringify(invoice)).digest('hex').slice(0, 32)
    return { kind: 'issued', number, etag: `i-${etag}`, invoice }
  }
  if (row.has_pdf !== true || typeof row.pdf_md5 !== 'string') return null
  return { kind: 'archived', number, etag: `a-${row.pdf_md5}` }
}

/** Nahrané PDF archivní faktury — jen přes funkci invoice_pdf (členství). */
export async function loadArchivedInvoicePdf(clientId: string, memberId: string, invoiceId: string): Promise<Buffer | null> {
  try {
    const rows = await portalDb({ clientId })<{ pdf_base64: string | null }>`
      SELECT pdf_base64 FROM portal.invoice_pdf(${invoiceId}, ${memberId})
    `
    const b64 = rows[0]?.pdf_base64
    return b64 ? Buffer.from(b64, 'base64') : null
  } catch (err) {
    const code = pgCode(err) ?? ''
    if (code === 'P0002' || TOLERATED.has(code)) return null
    throw err
  }
}
