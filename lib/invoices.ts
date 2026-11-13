import { randomUUID } from 'node:crypto'
import { adminDb, type AdminQuery } from '@/lib/admin/db'
import { ledgerSql, type LedgerSql } from '@/lib/admin/ledger'
import { projectPath } from '@/lib/lead-origins'
import type { InvoiceListItem, InvoiceRegistryItem } from '@/app/dashboard/finance/invoice-actions'
import type { InvoiceAiExtract } from '@/lib/types'
import {
  MAX_PDF_BYTES, MAX_PDF_LABEL, INVOICE_INCOME_CATEGORY,
  INVOICE_CURRENCIES, type InvoiceCurrency,
} from '@/lib/invoice-constants'

export {
  MAX_PDF_BYTES, MAX_PDF_LABEL, INVOICE_INCOME_CATEGORY,
  INVOICE_CURRENCIES, type InvoiceCurrency,
}

/**
 * Sloupce faktury pro každý výpis — jeden seznam pro archiv, evidenci,
 * zakázku i detail (AD13; dřív čtyři kopie osmnácti sloupců).
 *
 * `payment_reviewed_at` je z migrace 109, takže se dosazuje podle stavu
 * databáze: dokud migrace nedoběhne, vrací se `NULL` a admin se chová
 * jako dřív.
 */
export function invoiceColumns(L: LedgerSql): string {
  return `
  i.id::text, i.invoice_number, i.project_id::text, i.client_name, i.client_ico, i.client_dic,
  i.issued_on::text, i.due_on::text, i.paid_on::text, i.amount::float AS amount,
  i.currency, i.note, i.pdf_filename, i.pdf_size,
  (i.pdf_data IS NOT NULL) AS has_pdf,
  i.cancelled_at::text,
  ${L.has ? 'i.payment_reviewed_at::text' : 'NULL::text AS payment_reviewed_at'},
  p.lead_origin AS project_lead_origin,
  p.client_name AS project_client_name
`
}

export const INCOME_JOIN = `
  LEFT JOIN (
    SELECT source_project_id AS project_id, count(*)::int AS n
    FROM finance_transactions
    WHERE type = 'income' AND user_id IS NULL AND source_project_id IS NOT NULL
    GROUP BY source_project_id
  ) inc ON inc.project_id = i.project_id
  LEFT JOIN finance_transactions own
    ON own.id = i.finance_transaction_id
   AND own.type = 'income' AND own.user_id IS NULL AND own.source_project_id = i.project_id
`

export const OTHER_INCOME_COUNT = `GREATEST(COALESCE(inc.n, 0) - CASE WHEN own.id IS NULL THEN 0 ELSE 1 END, 0)::int AS other_income_count`

/** Řádek výpisu faktur tak, jak ho vrací `invoiceColumns` + `OTHER_INCOME_COUNT`. */
export type InvoiceRow = Omit<InvoiceListItem, 'project_href' | 'duplicate_risk'> & {
  project_lead_origin: string | null
  other_income_count: number
}

/** Řádek evidence: navíc popis zakázky (AD07 ho používá i při hledání). */
export type InvoiceRegistryRow = InvoiceRow & { project_description: string | null }

/**
 * „Kolik příjmů zakázky tahle faktura nezastupuje" — jediný signál dvojího
 * započtení, který jde spočítat v DB. Příjmy se sečtou jednou (`GROUP BY`)
 * a od součtu se odečte vlastní transakce faktury, když do téhož součtu patří.
 */
export function toInvoiceItem(row: InvoiceRow): InvoiceListItem {
  const { project_lead_origin: _origin, other_income_count, ...rest } = row
  return {
    ...rest,
    project_href: rest.project_id !== null ? projectPath(rest.project_id) : null,
    // Jednou vyřízené „Je tohle ta platba?" se znovu neptá (AD13).
    duplicate_risk: rest.paid_on !== null && other_income_count > 0 && rest.payment_reviewed_at === null,
  }
}

export function toInvoiceRegistryItem(row: InvoiceRegistryRow): InvoiceRegistryItem {
  const { project_description, ...base } = row
  return { ...toInvoiceItem(base), project_description }
}

/**
 * Sdílené jádro archivu faktur. Žije mimo `'use server'` soubor schválně —
 * volají ho jak server actions ve Financích, tak `createProject`, kde jde
 * fakturu přiložit rovnou při zakládání zakázky.
 *
 * Pravidlo, které tenhle modul drží: **jeden příjem vstupuje do ledgeru
 * právě jednou.** Faktura sama o sobě příjem nevytváří — vytvoří ho až
 * vyplnění `paid_on` (daňová evidence jede na hotovostním principu).
 */

export interface InvoiceInput {
  invoice_number: string
  project_id: string | null
  client_name: string | null
  client_ico: string | null
  client_dic: string | null
  issued_on: string
  due_on: string | null
  paid_on: string | null
  amount: number
  currency: string
  note: string | null
  ai_extracted: InvoiceAiExtract | null
}

export interface InvoicePdf {
  /** Obsah v base64 — neonový HTTP driver neumí poslat Buffer, bytea se skládá přes decode(). */
  base64: string
  filename: string
  size: number
}

export type ParsedInvoiceForm =
  | { error: string }
  | { data: InvoiceInput; pdf: InvoicePdf | null; removePdf: boolean }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function text(fd: FormData, key: string): string | null {
  const value = fd.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Ověří, že soubor je opravdu PDF — podle magic bytes `%PDF-`, ne podle
 * přípony ani deklarovaného MIME typu. Obojí umí klient nastavit libovolně.
 */
function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //  -
  )
}

/**
 * Načte nahraný soubor jako PDF. Sdílené s `/api/invoices/parse` — AI přepis
 * musí projít přesně stejnou kontrolou jako uložení, jinak by šlo poslat
 * modelu soubor, který by archiv stejně odmítl.
 */
export async function readPdfUpload(file: File): Promise<{ pdf: InvoicePdf } | { error: string }> {
  if (file.size > MAX_PDF_BYTES) {
    return { error: `PDF je příliš velké — maximum je ${MAX_PDF_LABEL}` }
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (!isPdfBytes(buffer)) return { error: 'Soubor není PDF' }

  return {
    pdf: {
      base64: buffer.toString('base64'),
      filename: file.name || 'faktura.pdf',
      size: buffer.byteLength,
    },
  }
}

/**
 * Surový výstup AI přepisu z formuláře. Je to jen metadata pro dohledatelnost —
 * když dorazí poškozený, zahodí se a uložení pokračuje. Přepis nikdy nesmí
 * zabránit uložení faktury.
 */
function readAiExtract(fd: FormData): InvoiceAiExtract | null {
  const raw = fd.get('ai_extracted')
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as InvoiceAiExtract) : null
  } catch {
    return null
  }
}

export async function parseInvoiceForm(fd: FormData): Promise<ParsedInvoiceForm> {
  const invoiceNumber = text(fd, 'invoice_number')
  if (!invoiceNumber) return { error: 'Číslo faktury je povinné' }

  const issuedOn = text(fd, 'issued_on')
  if (!issuedOn || !DATE_RE.test(issuedOn)) return { error: 'Datum vystavení je povinné' }

  const dueOn = text(fd, 'due_on')
  if (dueOn && !DATE_RE.test(dueOn)) return { error: 'Neplatné datum splatnosti' }

  const paidOn = text(fd, 'paid_on')
  if (paidOn && !DATE_RE.test(paidOn)) return { error: 'Neplatné datum zaplacení' }

  const rawAmount = text(fd, 'amount')
  const amount = rawAmount !== null ? Number(rawAmount) : NaN
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Neplatná částka' }

  const currency = (text(fd, 'currency') ?? 'CZK').toUpperCase()
  if (!INVOICE_CURRENCIES.includes(currency as InvoiceCurrency)) {
    return { error: 'Nepodporovaná měna' }
  }

  const data: InvoiceInput = {
    invoice_number: invoiceNumber,
    project_id: text(fd, 'project_id'),
    client_name: text(fd, 'client_name'),
    client_ico: text(fd, 'client_ico'),
    client_dic: text(fd, 'client_dic'),
    issued_on: issuedOn,
    due_on: dueOn,
    paid_on: paidOn,
    amount,
    currency,
    note: text(fd, 'note'),
    ai_extracted: readAiExtract(fd),
  }

  const file = fd.get('pdf')
  let pdf: InvoicePdf | null = null

  if (file instanceof File && file.size > 0) {
    const read = await readPdfUpload(file)
    if ('error' in read) return { error: read.error }
    pdf = read.pdf
  }

  return { data, pdf, removePdf: fd.get('remove_pdf') === '1' }
}

/**
 * Srovná ledger se stavem faktury — **jedním požadavkem, v jedné transakci**.
 *
 * `paid_on` vyplněno → faktura musí mít v ledgeru právě jeden příjem.
 * Buď převezme ten, který už zakázka založila (stejná částka i měna, zatím
 * nezabraný jinou fakturou), nebo si založí vlastní. Převzatou transakci
 * nikdy nepřepisuje ani nemaže — patří zakázce.
 *
 * `paid_on` prázdné → faktura je pohledávka a v ledgeru nesmí mít nic:
 * vlastní transakce se maže, převzatá se jen rozváže.
 *
 * Do AD13 to bylo 4–6 samostatných dotazů (načti fakturu → načti vazbu →
 * hledej adoptovatelnou transakci → vlož/uprav → naváž). Pád nebo timeout
 * mezi nimi nechal fakturu zaplacenou, ale bez příjmu — tedy chybějící
 * peníze v daňovém základu. Každá větev je teď jeden SQL příkaz, který je
 * sám o sobě no-op, když na fakturu nesedí; celá sada jde do databáze jako
 * jedna dávka (`adminDb.batch` = jedna Neon HTTP transakce), takže platí
 * buď celá, nebo nic.
 */
export function invoiceSyncQueries(L: LedgerSql, invoiceId: string): AdminQuery[] {
  // Měna je v ledgeru až od migrace 109. Dokud nedoběhne, chová se sync
  // přesně jako dřív (viz `lib/admin/ledger.ts`).
  const withCurrency = L.has
  const currencyMatch = withCurrency ? `AND t.currency = f.currency` : ''

  return [
    // 1. Pohledávka (nebo storno): vlastní příjem v ledgeru nemá co dělat.
    {
      text: `
        DELETE FROM finance_transactions t
        USING invoices i
        WHERE i.id = $1 AND i.paid_on IS NULL AND t.source_invoice_id = i.id
      `,
      params: [invoiceId],
    },
    // 2. …a vazba na něj taky ne. Převzatý příjem zůstává zakázce.
    {
      text: `
        UPDATE invoices
        SET finance_transaction_id = NULL${withCurrency ? ', payment_origin = NULL, payment_reviewed_at = NULL' : ''}
        WHERE id = $1 AND paid_on IS NULL AND finance_transaction_id IS NOT NULL
      `,
      params: [invoiceId],
    },
    // 3. Vazba na transakci, která už neexistuje (smazaná ručně ve Financích),
    //    by zablokovala jak převzetí, tak vložení. Uklidí se.
    {
      text: `
        UPDATE invoices i SET finance_transaction_id = NULL
        WHERE i.id = $1 AND i.finance_transaction_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM finance_transactions t WHERE t.id = i.finance_transaction_id)
      `,
      params: [invoiceId],
    },
    // 4. Zaplaceno + vlastní transakce → srovnat ji s dokladem.
    {
      text: `
        UPDATE finance_transactions t
        SET amount = i.amount, date = i.paid_on, declared = true${withCurrency ? ', currency = i.currency' : ''}
        FROM invoices i
        WHERE i.id = $1 AND i.paid_on IS NOT NULL
          AND t.id = i.finance_transaction_id AND t.source_invoice_id = i.id
      `,
      params: [invoiceId],
    },
    // 5. Zaplaceno + převzatá transakce → měníme na ní jen příslušnost k linii.
    {
      text: `
        UPDATE finance_transactions t
        SET declared = true
        FROM invoices i
        WHERE i.id = $1 AND i.paid_on IS NOT NULL
          AND t.id = i.finance_transaction_id AND t.source_invoice_id IS DISTINCT FROM i.id
      `,
      params: [invoiceId],
    },
    // 6. Zakázka už možná svůj příjem do ledgeru zapsala (zaplacená zakázka /
    //    záloha). Stejná částka i měna = tytéž peníze, jen jiný doklad →
    //    převzít, nezakládat druhý.
    //
    //    Od AD13 se převezme **jen jednoznačný** kandidát. Dřív se bral první
    //    podle data, takže u dvou stejně vysokých příjmů (záloha a doplatek
    //    stejné výše) mohla faktura převzít ten špatný. Je-li kandidátů víc,
    //    rozhodne člověk v detailu faktury („Je tohle ta platba?").
    {
      text: `
        WITH faktura AS (
          SELECT i.id, i.project_id, i.amount${withCurrency ? ', i.currency' : ''}
          FROM invoices i
          WHERE i.id = $1 AND i.paid_on IS NOT NULL
            AND i.finance_transaction_id IS NULL AND i.project_id IS NOT NULL
        ),
        kandidati AS (
          SELECT t.id
          FROM finance_transactions t JOIN faktura f ON t.source_project_id = f.project_id
          WHERE t.type = 'income'
            AND t.user_id IS NULL
            AND t.source_invoice_id IS NULL
            AND t.amount = f.amount
            ${currencyMatch}
            AND NOT EXISTS (SELECT 1 FROM invoices x WHERE x.finance_transaction_id = t.id)
        ),
        jediny AS (
          SELECT id FROM kandidati WHERE (SELECT count(*) FROM kandidati) = 1
        ),
        prevzeti AS (
          UPDATE finance_transactions SET declared = true
          WHERE id IN (SELECT id FROM jediny)
          RETURNING id
        )
        UPDATE invoices
        SET finance_transaction_id = (SELECT id FROM prevzeti)${withCurrency ? `, payment_origin = 'adopted'` : ''}
        WHERE id = $1 AND EXISTS (SELECT 1 FROM prevzeti)
      `,
      params: [invoiceId],
    },
    // 7. Nic k převzetí → faktura si příjem založí sama.
    {
      text: `
        WITH faktura AS (
          SELECT i.id, i.project_id, i.amount, i.paid_on, i.invoice_number${withCurrency ? ', i.currency' : ''}
          FROM invoices i
          WHERE i.id = $1 AND i.paid_on IS NOT NULL AND i.finance_transaction_id IS NULL
        ),
        vlozeni AS (
          INSERT INTO finance_transactions
            (amount, type, category, note, date, user_id, source_project_id, source_invoice_id, declared${withCurrency ? ", currency, income_origin" : ''})
          SELECT f.amount, 'income', $2, 'Faktura ' || f.invoice_number, f.paid_on,
                 NULL, f.project_id, f.id, true${withCurrency ? ", f.currency, 'invoice'" : ''}
          FROM faktura f
          RETURNING id
        )
        UPDATE invoices
        SET finance_transaction_id = (SELECT id FROM vlozeni)${withCurrency ? `, payment_origin = 'created'` : ''}
        WHERE id = $1 AND EXISTS (SELECT 1 FROM vlozeni)
      `,
      params: [invoiceId, INVOICE_INCOME_CATEGORY],
    },
  ]
}

/** Srovnání ledgeru samostatně — jedna dávka, jedno kolo do databáze. */
export async function syncInvoiceTransaction(invoiceId: string): Promise<void> {
  await adminDb.batch(invoiceSyncQueries(await ledgerSql(), invoiceId))
}

export async function insertInvoice(
  data: InvoiceInput,
  pdf: InvoicePdf | null
): Promise<{ id: string }> {
  // Id se generuje tady, ne v databázi: uložení dokladu a jeho zápis do
  // ledgeru tak jde do jedné dávky, místo aby se na id čekalo zvlášť.
  const id = randomUUID()
  const L = await ledgerSql()

  await adminDb.batch([
    {
      text: `
        INSERT INTO invoices (
          id, invoice_number, project_id, client_name, client_ico, client_dic,
          issued_on, due_on, paid_on, amount, currency, note,
          pdf_data, pdf_filename, pdf_size, ai_extracted
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          decode($13::text, 'base64'), $14, $15, $16::jsonb
        )
      `,
      params: [
        id, data.invoice_number, data.project_id, data.client_name, data.client_ico, data.client_dic,
        data.issued_on, data.due_on, data.paid_on, data.amount, data.currency, data.note,
        pdf?.base64 ?? null, pdf?.filename ?? null, pdf?.size ?? null,
        data.ai_extracted ? JSON.stringify(data.ai_extracted) : null,
      ],
    },
    ...invoiceSyncQueries(L, id),
  ])

  return { id }
}

export async function updateInvoiceRow(
  id: string,
  data: InvoiceInput,
  pdf: InvoicePdf | null,
  removePdf: boolean
): Promise<void> {
  const base: AdminQuery[] = [
    {
      text: `
        UPDATE invoices SET
          invoice_number = $2, project_id = $3, client_name = $4, client_ico = $5, client_dic = $6,
          issued_on = $7, due_on = $8, paid_on = $9, amount = $10, currency = $11, note = $12,
          updated_at = now()
        WHERE id = $1
      `,
      params: [
        id, data.invoice_number, data.project_id, data.client_name, data.client_ico, data.client_dic,
        data.issued_on, data.due_on, data.paid_on, data.amount, data.currency, data.note,
      ],
    },
  ]

  // Jen když přepis reálně proběhl — běžná editace nesmí přepsat historii
  // toho, co AI kdysi vyčetla, prázdnou hodnotou.
  if (data.ai_extracted) {
    base.push({
      text: `UPDATE invoices SET ai_extracted = $2::jsonb WHERE id = $1`,
      params: [id, JSON.stringify(data.ai_extracted)],
    })
  }

  if (pdf) {
    base.push({
      text: `
        UPDATE invoices
        SET pdf_data = decode($2::text, 'base64'), pdf_filename = $3, pdf_size = $4
        WHERE id = $1
      `,
      params: [id, pdf.base64, pdf.filename, pdf.size],
    })
  } else if (removePdf) {
    base.push({
      text: `UPDATE invoices SET pdf_data = NULL, pdf_filename = NULL, pdf_size = NULL WHERE id = $1`,
      params: [id],
    })
  }

  await adminDb.batch([...base, ...invoiceSyncQueries(await ledgerSql(), id)])
}

/**
 * Smaže fakturu i příjem, který sama založila. Převzatý příjem zůstává —
 * patří zakázce a peníze reálně dorazily. Obojí jednou dávkou: smazaný
 * doklad nesmí po pádu uprostřed nechat v ledgeru příjem bez faktury.
 */
export async function deleteInvoiceRow(id: string): Promise<void> {
  await adminDb.batch([
    { text: `DELETE FROM finance_transactions WHERE source_invoice_id = $1::uuid`, params: [id] },
    { text: `DELETE FROM invoices WHERE id = $1`, params: [id] },
  ])
}
