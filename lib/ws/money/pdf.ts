import 'server-only'
import type { Invoice } from './data'
import {
  invoiceHtml as renderHtml, renderInvoicePdf as renderPdf, spaydPaymentString as spayd,
  type InvoicePdfBrand, type InvoicePdfDoc,
} from '@/lib/invoice-pdf/render'

/**
 * Faktura Workspace → sdílený generátor PDF.
 *
 * Od AD12 je sazba, QR kód i tisk v `lib/invoice-pdf/render.ts` a používá
 * je i admin konzole. Tady zůstalo jen to, co je vlastní Workspace:
 * čtení nahraného PDF a překlad řádku `ws.invoices` do úzkého tvaru
 * dokladu. Chování se nemění.
 */

export { isPublicV4 } from '@/lib/invoice-pdf/render'

export const MAX_PDF_BYTES = 4 * 1024 * 1024

export async function readPdf(file: File) {
  if (file.size === 0 || file.size > MAX_PDF_BYTES) throw new Error('money_pdf_size')
  const data = Buffer.from(await file.arrayBuffer())
  if (data.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('money_pdf_type')
  return { base64: data.toString('base64'), filename: file.name.replace(/[\r\n\/\\]/g, '_').slice(0, 120) || 'faktura.pdf' }
}

/** QR k zaplacení patří jen na vystavenou fakturu, která ještě čeká na peníze. */
function toDoc(invoice: Invoice): InvoicePdfDoc {
  return {
    number: invoice.number,
    issuer: invoice.issuer,
    counterparty: invoice.counterparty,
    issuedOn: invoice.issuedOn,
    suppliedOn: invoice.suppliedOn,
    dueOn: invoice.dueOn,
    paidOn: invoice.paidOn,
    amount: invoice.amount,
    currency: invoice.currency,
    items: invoice.items,
    note: invoice.note,
    payable: invoice.direction === 'issued' && invoice.status === 'issued',
  }
}

export function spaydPaymentString(invoice: Invoice): string | null {
  return spayd(toDoc(invoice))
}

export function invoiceHtml(invoice: Invoice, brand: InvoicePdfBrand) {
  return renderHtml(toDoc(invoice), brand)
}

export function renderInvoicePdf(invoice: Invoice, brand: InvoicePdfBrand) {
  return renderPdf(toDoc(invoice), brand)
}
