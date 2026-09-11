import { sql } from '@/lib/db'
import type { Invoice, InvoiceAiExtract } from '@/lib/types'
import {
  MAX_PDF_BYTES, MAX_PDF_LABEL, INVOICE_INCOME_CATEGORY,
  INVOICE_CURRENCIES, type InvoiceCurrency,
} from '@/lib/invoice-constants'

export {
  MAX_PDF_BYTES, MAX_PDF_LABEL, INVOICE_INCOME_CATEGORY,
  INVOICE_CURRENCIES, type InvoiceCurrency,
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

type StoredInvoice = Pick<Invoice, 'id' | 'project_id' | 'amount' | 'paid_on' | 'invoice_number' | 'finance_transaction_id'>

async function loadInvoice(id: string): Promise<StoredInvoice | null> {
  const rows = await sql`
    SELECT id::text, project_id::text, amount::float AS amount, paid_on::text,
           invoice_number, finance_transaction_id::text
    FROM invoices WHERE id = ${id} LIMIT 1
  `
  return (rows[0] as StoredInvoice | undefined) ?? null
}

/**
 * Srovná ledger se stavem faktury.
 *
 * `paid_on` vyplněno → faktura musí mít v ledgeru právě jeden příjem.
 * Buď převezme ten, který už zakázka založila (stejná částka, zatím
 * nezabraný jinou fakturou), nebo si založí vlastní. Převzatou transakci
 * nikdy nepřepisuje ani nemaže — patří zakázce.
 *
 * `paid_on` prázdné → faktura je pohledávka a v ledgeru nesmí mít nic:
 * vlastní transakce se maže, převzatá se jen rozváže.
 */
export async function syncInvoiceTransaction(invoiceId: string): Promise<void> {
  const invoice = await loadInvoice(invoiceId)
  if (!invoice) return

  const linked = invoice.finance_transaction_id
    ? ((
        await sql`
          SELECT id::text, source_invoice_id::text
          FROM finance_transactions WHERE id = ${invoice.finance_transaction_id} LIMIT 1
        `
      )[0] as { id: string; source_invoice_id: string | null } | undefined) ?? null
    : null

  const ownsLinked = linked?.source_invoice_id === invoice.id

  if (!invoice.paid_on) {
    if (linked && ownsLinked) {
      await sql`DELETE FROM finance_transactions WHERE id = ${linked.id}`
    }
    if (invoice.finance_transaction_id) {
      await sql`UPDATE invoices SET finance_transaction_id = NULL WHERE id = ${invoice.id}`
    }
    return
  }

  if (linked) {
    if (ownsLinked) {
      await sql`
        UPDATE finance_transactions
        SET amount = ${invoice.amount}, date = ${invoice.paid_on}, declared = true
        WHERE id = ${linked.id}
      `
    } else {
      // Převzatá transakce patří zakázce — měníme na ní jen příslušnost k linii.
      await sql`UPDATE finance_transactions SET declared = true WHERE id = ${linked.id}`
    }
    return
  }

  // Zakázka už možná svůj příjem do ledgeru zapsala (zaplacená zakázka /
  // záloha). Stejná částka = tytéž peníze, jen jiný doklad → převzít,
  // nezakládat druhý.
  if (invoice.project_id) {
    const candidates = await sql`
      SELECT t.id::text
      FROM finance_transactions t
      WHERE t.source_project_id = ${invoice.project_id}
        AND t.type = 'income'
        AND t.user_id IS NULL
        AND t.source_invoice_id IS NULL
        AND t.amount = ${invoice.amount}
        AND NOT EXISTS (
          SELECT 1 FROM invoices i WHERE i.finance_transaction_id = t.id
        )
      ORDER BY t.date DESC
      LIMIT 1
    `
    const adopted = (candidates[0] as { id: string } | undefined) ?? null
    if (adopted) {
      await sql`UPDATE finance_transactions SET declared = true WHERE id = ${adopted.id}`
      await sql`UPDATE invoices SET finance_transaction_id = ${adopted.id}::uuid WHERE id = ${invoice.id}`
      return
    }
  }

  const note = `Faktura ${invoice.invoice_number}`
  const inserted = await sql`
    INSERT INTO finance_transactions
      (amount, type, category, note, date, user_id, source_project_id, source_invoice_id, declared)
    VALUES (
      ${invoice.amount},
      'income',
      ${INVOICE_INCOME_CATEGORY},
      ${note},
      ${invoice.paid_on},
      NULL,
      ${invoice.project_id},
      ${invoice.id}::uuid,
      true
    )
    RETURNING id::text AS id
  `
  const transactionId = (inserted[0] as { id: string }).id
  await sql`UPDATE invoices SET finance_transaction_id = ${transactionId}::uuid WHERE id = ${invoice.id}`
}

export async function insertInvoice(
  data: InvoiceInput,
  pdf: InvoicePdf | null
): Promise<{ id: string }> {
  const rows = await sql`
    INSERT INTO invoices (
      invoice_number, project_id, client_name, client_ico, client_dic,
      issued_on, due_on, paid_on, amount, currency, note,
      pdf_data, pdf_filename, pdf_size, ai_extracted
    ) VALUES (
      ${data.invoice_number},
      ${data.project_id},
      ${data.client_name},
      ${data.client_ico},
      ${data.client_dic},
      ${data.issued_on},
      ${data.due_on},
      ${data.paid_on},
      ${data.amount},
      ${data.currency},
      ${data.note},
      decode(${pdf?.base64 ?? null}::text, 'base64'),
      ${pdf?.filename ?? null},
      ${pdf?.size ?? null},
      ${data.ai_extracted ? JSON.stringify(data.ai_extracted) : null}::jsonb
    )
    RETURNING id::text AS id
  `
  const id = (rows[0] as { id: string }).id
  await syncInvoiceTransaction(id)
  return { id }
}

export async function updateInvoiceRow(
  id: string,
  data: InvoiceInput,
  pdf: InvoicePdf | null,
  removePdf: boolean
): Promise<void> {
  await sql`
    UPDATE invoices SET
      invoice_number = ${data.invoice_number},
      project_id = ${data.project_id},
      client_name = ${data.client_name},
      client_ico = ${data.client_ico},
      client_dic = ${data.client_dic},
      issued_on = ${data.issued_on},
      due_on = ${data.due_on},
      paid_on = ${data.paid_on},
      amount = ${data.amount},
      currency = ${data.currency},
      note = ${data.note},
      updated_at = now()
    WHERE id = ${id}
  `

  // Jen když přepis reálně proběhl — běžná editace nesmí přepsat historii
  // toho, co AI kdysi vyčetla, prázdnou hodnotou.
  if (data.ai_extracted) {
    await sql`
      UPDATE invoices SET ai_extracted = ${JSON.stringify(data.ai_extracted)}::jsonb WHERE id = ${id}
    `
  }

  if (pdf) {
    await sql`
      UPDATE invoices
      SET pdf_data = decode(${pdf.base64}::text, 'base64'),
          pdf_filename = ${pdf.filename},
          pdf_size = ${pdf.size}
      WHERE id = ${id}
    `
  } else if (removePdf) {
    await sql`
      UPDATE invoices SET pdf_data = NULL, pdf_filename = NULL, pdf_size = NULL WHERE id = ${id}
    `
  }

  await syncInvoiceTransaction(id)
}

/**
 * Smaže fakturu i příjem, který sama založila. Převzatý příjem zůstává —
 * patří zakázce a peníze reálně dorazily.
 */
export async function deleteInvoiceRow(id: string): Promise<void> {
  await sql`DELETE FROM finance_transactions WHERE source_invoice_id = ${id}::uuid`
  await sql`DELETE FROM invoices WHERE id = ${id}`
}
