import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifyBearerApiKey, getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { insertInvoice, type InvoiceInput, type InvoicePdf } from '@/lib/invoices'
import { extractInvoiceFromPdf } from '@/lib/invoice-ai'
import { MAX_PDF_BYTES, MAX_PDF_LABEL, INVOICE_CURRENCIES } from '@/lib/invoice-constants'
import { createNotification } from '@/lib/notifications'
import type { InvoiceAiExtract } from '@/lib/types'

/**
 * Zakládání faktur zvenčí — pro n8n (přeposlaný e-mail s fakturou, export
 * z fakturačního nástroje). Stejný vzor jako `/api/public/agent-leads`:
 * bearer klíč, rate limit, Zod validace.
 *
 * Dvě cesty, jak fakturu poslat:
 *   1. hotová pole v JSONu,
 *   2. `pdf_base64` — chybějící pole doplní AI přepis (stejný jako v adminu).
 *
 * AI je doplněk, ne podmínka: když přepis selže a povinná pole v těle nejsou,
 * endpoint odpoví 422 a řekne, co doplnit ručně. Nikdy nezaloží fakturu
 * s vymyšlenými čísly.
 */

const ENDPOINT = 'public_invoice'
const RATE_LIMIT_WINDOW_MINUTES = 1
const RATE_LIMIT_MAX_REQUESTS = 10

// Přepis PDF modelem se do výchozích 10 s na Vercelu nevejde.
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const dateField = z.string().regex(DATE_RE, 'Datum musí být ve tvaru YYYY-MM-DD')

const payloadSchema = z.object({
  invoice_number: z.string().min(1).max(64).optional(),
  issued_on: dateField.optional(),
  due_on: dateField.nullable().optional(),
  paid_on: dateField.nullable().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.enum(INVOICE_CURRENCIES).optional(),
  client_name: z.string().max(200).nullable().optional(),
  client_ico: z.string().max(20).nullable().optional(),
  client_dic: z.string().max(20).nullable().optional(),
  project_id: z.uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  /** PDF faktury v base64, bez data URI prefixu */
  pdf_base64: z.string().min(1).optional(),
  pdf_filename: z.string().max(255).optional(),
})

function errorResponse(status: number, error: string, code: string): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

/** Ověří base64 PDF proti stejným pravidlům jako upload v adminu. */
function readBase64Pdf(base64: string, filename?: string): { pdf: InvoicePdf } | { error: string } {
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return { error: 'pdf_base64 není platný base64' }
  }
  if (buffer.byteLength === 0) return { error: 'pdf_base64 je prázdné' }
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return { error: `PDF je příliš velké — maximum je ${MAX_PDF_LABEL}` }
  }
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { error: 'pdf_base64 není PDF' }
  }
  return {
    pdf: {
      base64: buffer.toString('base64'),
      filename: filename || 'faktura.pdf',
      size: buffer.byteLength,
    },
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req)

  if (await isApiRateLimited(ENDPOINT, ip, RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX_REQUESTS)) {
    return errorResponse(429, 'Příliš mnoho požadavků. Zkuste to prosím později.', 'RATE_LIMITED')
  }
  await recordApiRequest(ENDPOINT, ip)

  if (!verifyBearerApiKey(req, 'INVOICES_API_KEY')) {
    return errorResponse(401, 'Neplatný nebo chybějící API klíč', 'UNAUTHORIZED')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse(400, 'Neplatné JSON tělo požadavku', 'INVALID_BODY')
  }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? 'Neplatná data', 'VALIDATION_ERROR')
  }
  const input = parsed.data

  let pdf: InvoicePdf | null = null
  if (input.pdf_base64) {
    const read = readBase64Pdf(input.pdf_base64, input.pdf_filename)
    if ('error' in read) return errorResponse(400, read.error, 'INVALID_PDF')
    pdf = read.pdf
  }

  // Přepis se pouští jen když je co doplnit — zbytečné volání modelu u
  // požadavku s kompletními poli by jen stálo peníze a čas.
  const needsFields = !input.invoice_number || !input.issued_on || input.amount === undefined
  let extract: InvoiceAiExtract | null = null
  if (pdf && needsFields) {
    const result = await extractInvoiceFromPdf(pdf.base64)
    extract = result.data ?? null
  }

  const invoiceNumber = input.invoice_number ?? extract?.invoice_number ?? null
  const issuedOn = input.issued_on ?? extract?.issued_on ?? null
  const amount = input.amount ?? extract?.amount ?? null

  const missing = [
    invoiceNumber ? null : 'invoice_number',
    issuedOn ? null : 'issued_on',
    amount === null ? 'amount' : null,
  ].filter(Boolean)

  if (missing.length > 0) {
    return errorResponse(
      422,
      `Chybí povinná pole: ${missing.join(', ')}${pdf ? ' — z PDF se je nepodařilo vyčíst' : ''}`,
      'INCOMPLETE_INVOICE'
    )
  }

  const data: InvoiceInput = {
    invoice_number: invoiceNumber as string,
    project_id: input.project_id ?? null,
    client_name: input.client_name ?? extract?.client_name ?? null,
    client_ico: input.client_ico ?? extract?.client_ico ?? null,
    client_dic: input.client_dic ?? extract?.client_dic ?? null,
    issued_on: issuedOn as string,
    due_on: input.due_on ?? extract?.due_on ?? null,
    // Zaplacení určuje jen volající. Doklad o něm nic neříká a AI ho nepřepisuje —
    // rozhoduje o zdanitelném příjmu, takže se nesmí odhadovat.
    paid_on: input.paid_on ?? null,
    amount: amount as number,
    currency: input.currency ?? extract?.currency ?? 'CZK',
    note: input.note ?? null,
    ai_extracted: extract,
  }

  let id: string
  try {
    ;({ id } = await insertInvoice(data, pdf))
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      return errorResponse(409, 'Faktura s tímhle číslem už v archivu je', 'DUPLICATE_INVOICE')
    }
    console.error('[public/invoices] uložení selhalo:', err)
    return errorResponse(500, 'Nepodařilo se uložit fakturu', 'INSERT_FAILED')
  }

  revalidatePath('/hub/finance')
  if (data.project_id) {
    revalidatePath(`/dashboard/${data.project_id}`)
    revalidatePath(`/alteno/${data.project_id}`)
  }

  // Nekritický vedlejší efekt — notifikace si chyby chytá sama.
  createNotification({
    type: 'invoice_received',
    title: `Nová faktura ${data.invoice_number}`,
    body: `${data.client_name ?? 'Bez odběratele'} — ${data.amount} ${data.currency}${
      data.paid_on ? ` · zaplaceno ${data.paid_on}` : ' · pohledávka'
    }`,
    link: '/hub/finance?tab=podnikani',
  })

  return NextResponse.json(
    { success: true, invoice: { id, invoice_number: data.invoice_number, ai_used: extract !== null } },
    { status: 201 }
  )
}
