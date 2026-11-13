import 'server-only'
import { documentStyles, escapeHtml, renderPdf, type PdfBrand } from './render'

/**
 * PDF předávacího dokumentu „co bylo dodané" (AD16).
 *
 * Jede **stejnou cestou jako faktura**: tytéž tokeny Dílků, tatáž vložená
 * písma, tentýž Chromium bez sítě a bez JavaScriptu (`lib/invoice-pdf/render.ts`).
 * Žádná nová závislost — `puppeteer-core` i `@sparticuz/chromium` v projektu
 * dávno jsou.
 *
 * Dokument **není daňový doklad**: nemá číslo z řady, nic nepočítá a nic
 * neuzamyká. Je to soupis toho, co si klient odnáší, a čeho se údržba týká.
 */

export type HandoverPdf = {
  projectTitle: string
  clientName: string
  issuerName: string
  issuedOn: string
  summary: string
  items: { label: string; note: string }[]
  access: { label: string; where: string }[]
  maintenance: { included: string[]; excluded: string[] }
  note: string
}

const CSS =
  '@page{size:A4;margin:18mm}*{box-sizing:border-box}' +
  'body[data-app="ws"]{font-family:InvoiceSans,sans-serif;font-size:13px;color:rgb(var(--ink));background:rgb(var(--surface))}' +
  'h1{font-size:28px;letter-spacing:-.03em;margin:0}' +
  'h2{font-size:14px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.08em;color:rgb(var(--quiet))}' +
  'p{margin:5px 0;white-space:pre-line;overflow-wrap:anywhere}' +
  '.brand{display:flex;align-items:center;gap:16px;border-bottom:2px solid rgb(var(--navy-100));padding-bottom:16px}' +
  '.tiles{display:grid;grid-template-columns:12px 12px;gap:4px}.tiles i{height:12px;border-radius:3px;background:rgb(var(--navy-700))}' +
  'small{display:block;margin-bottom:4px;color:rgb(var(--quiet))}' +
  '.numbers{font-family:InvoiceMono,monospace}' +
  '.meta{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:20px 0}' +
  'ul{margin:0;padding:0;list-style:none}' +
  'li{padding:8px 0;border-bottom:1px solid rgb(var(--navy-100));break-inside:avoid}' +
  'li span{display:block;color:rgb(var(--quiet));font-size:12px;margin-top:2px}' +
  '.care{display:grid;grid-template-columns:1fr 1fr;gap:24px;break-inside:avoid}' +
  '.care section{border:1px solid rgb(var(--navy-100));border-radius:16px;padding:14px}' +
  '.care h3{margin:0 0 8px;font-size:13px}' +
  '.foot{margin-top:20px;font-size:12px;color:rgb(var(--quiet))}'

/** „9. 11. 2026" — na dokumentu musí být rok, stejně jako na faktuře. */
function formatDocumentDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return `${day}. ${month}. ${year}`
}

function list(rows: { label: string; note: string }[]): string {
  return (
    '<ul>' +
    rows
      .map(
        (row) =>
          '<li><strong>' +
          escapeHtml(row.label) +
          '</strong>' +
          (row.note ? '<span>' + escapeHtml(row.note) + '</span>' : '') +
          '</li>',
      )
      .join('') +
    '</ul>'
  )
}

function simpleList(rows: string[]): string {
  return '<ul>' + rows.map((row) => '<li>' + escapeHtml(row) + '</li>').join('') + '</ul>'
}

export async function handoverHtml(doc: HandoverPdf, brand: PdfBrand): Promise<string> {
  const care = doc.maintenance
  const hasCare = care.included.length > 0 || care.excluded.length > 0

  // Uživatelské hodnoty se serializují pouze jako escapovaný text, nikdy HTML.
  return (
    '<!doctype html><html lang="cs"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src ' +
    escapeHtml("'none'") +
    '; img-src data:; font-src data:; style-src ' +
    escapeHtml("'unsafe-inline'") +
    '">' +
    '<style>' +
    (await documentStyles(CSS)) +
    '</style></head><body data-app="ws">' +
    '<div class="brand"><div class="tiles"><i></i><i></i><i></i><i></i></div>' +
    '<div><small>' +
    escapeHtml(brand.name) +
    '</small><h1>Co bylo dodané</h1></div></div>' +
    '<div class="meta"><section><small>Zakázka</small><strong>' +
    escapeHtml(doc.projectTitle) +
    '</strong><p>' +
    escapeHtml(doc.clientName) +
    '</p></section>' +
    '<section><small>Předáno</small><p class="numbers">' +
    escapeHtml(formatDocumentDate(doc.issuedOn)) +
    '</p><p>' +
    escapeHtml(doc.issuerName) +
    '</p></section></div>' +
    (doc.summary ? '<p>' + escapeHtml(doc.summary) + '</p>' : '') +
    (doc.items.length ? '<h2>Co jste dostali</h2>' + list(doc.items) : '') +
    (doc.access.length
      ? '<h2>Kde máte přístupy</h2>' +
        list(doc.access.map((a) => ({ label: a.label, note: a.where }))) +
        '<p class="foot">Přihlašovací údaje v tomhle dokumentu nejsou — posílám je zvlášť.</p>'
      : '') +
    (hasCare
      ? '<h2>Údržba</h2><div class="care">' +
        '<section><h3>V ceně údržby</h3>' +
        (care.included.length ? simpleList(care.included) : '<p>Nic sjednaného.</p>') +
        '</section>' +
        '<section><h3>Mimo údržbu</h3>' +
        (care.excluded.length ? simpleList(care.excluded) : '<p>Nic sjednaného.</p>') +
        '</section></div>'
      : '') +
    (doc.note ? '<p class="foot">' + escapeHtml(doc.note) + '</p>' : '') +
    '</body></html>'
  )
}

export async function renderHandoverPdf(doc: HandoverPdf, brand: PdfBrand): Promise<Buffer> {
  return renderPdf(await handoverHtml(doc, brand))
}
