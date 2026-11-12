import 'server-only'
import type { Invoice } from './data'
import { invoiceHtml as renderHtml, renderInvoicePdf as renderPdf, spaydPaymentString as spayd, type PdfBrand, type PdfInvoice } from '@/lib/invoice-pdf/render'
export { isPublicV4 } from '@/lib/invoice-pdf/render'

// Vykreslení PDF je od AD12 sdílené s adminem (lib/invoice-pdf/render.ts).
// Tady zůstalo jen to, co je vlastní Workspace: čtení nahraného PDF a převod
// faktury ze schématu `ws` do vstupu pro renderer.
export const MAX_PDF_BYTES=4*1024*1024
export async function readPdf(file:File) {
 if(file.size===0||file.size>MAX_PDF_BYTES)throw new Error('money_pdf_size')
 const data=Buffer.from(await file.arrayBuffer())
 if(data.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error('money_pdf_type')
 return {base64:data.toString('base64'),filename:file.name.replace(/[\r\n\/\\]/g,'_').slice(0,120)||'faktura.pdf'}
}

/** Platí se jen vystavená faktura, která ještě není zaplacená ani stornovaná. */
function toPdfInvoice(invoice:Invoice):PdfInvoice {
 return {number:invoice.number,issuer:invoice.issuer,counterparty:invoice.counterparty,
  issuedOn:invoice.issuedOn,suppliedOn:invoice.suppliedOn,dueOn:invoice.dueOn,paidOn:invoice.paidOn,
  amount:invoice.amount,currency:invoice.currency,items:invoice.items,note:invoice.note,
  payable:invoice.direction==='issued'&&invoice.status==='issued'}
}

export function spaydPaymentString(invoice:Invoice):string|null { return spayd(toPdfInvoice(invoice)) }
export function invoiceHtml(invoice:Invoice,brand:PdfBrand):Promise<string> { return renderHtml(toPdfInvoice(invoice),brand) }
export function renderInvoicePdf(invoice:Invoice,brand:PdfBrand):Promise<Buffer> { return renderPdf(toPdfInvoice(invoice),brand) }
