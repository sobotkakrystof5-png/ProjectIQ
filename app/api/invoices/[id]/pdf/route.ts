import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createHash } from 'crypto'
import { adminDb } from '@/lib/admin/db'
import { loadInvoiceDoc, loadIssuerProfile } from '@/lib/admin/invoicing'
import { renderInvoicePdf } from '@/lib/invoice-pdf/render'

/**
 * Servírování PDF faktury.
 *
 * `proxy.ts` hlídá jen `/dashboard` (a `/alteno`, `/hub` jako pojistku) — na `/api`
 * nesahá. Auth check tady proto není pojistka navíc, ale jediná ochrana:
 * faktura nese údaje klienta (IČO, DIČ, adresu) a nesmí uniknout ven.
 *
 * Dva dotazy, ne jeden (AD08): nejdřív se přečte jen `md5(pdf_data)` a název,
 * a když prohlížeč posílá stejný `If-None-Match`, odpoví se 304 a **bajty se
 * z databáze vůbec netahají**. Detail zakázky i evidence faktur odkaz
 * otevírají opakovaně a dokument může mít megabajty.
 *
 * Od AD12 tudy chodí dvě různé věci. Archivní doklad má PDF nahrané od
 * začátku. Fakturu vystavenou tady vyrobí až první otevření: vygeneruje se
 * (Chromium), uloží do `pdf_data` a dál se servíruje jako každý jiný soubor,
 * takže druhé otevření stojí jeden dotaz a třetí 304. Generuje se schválně
 * v route handleru, ne v server action stránky — jinak by Chromium viselo
 * u každé obrazovky, která fakturu jen zmiňuje.
 *
 * `bytea` se čte jako base64 — neonový HTTP driver vrací binární sloupce
 * jako escapovaný text, přes `encode()` je výsledek jednoznačný. Streamovat
 * ho nejde: HTTP driver vrací celou odpověď jedním JSONem, takže by „stream"
 * byl jen jiný obal nad stejným bufferem. Skutečný stream by znamenal
 * připojení přes Pool (WebSocket na Vercelu) — to je samostatné rozhodnutí.
 */

export const runtime = 'nodejs'
// Puppeteer tu neběží (PDF už je v databázi), ale megabajtový dokument
// na pomalé lince nesmí spadnout na výchozím limitu.
export const maxDuration = 30

type Meta = {
  etag: string | null
  size: number | null
  pdf_filename: string | null
  invoice_number: string
  pdf_generated: boolean
}

/**
 * `id` jde do dotazu jako `uuid`, takže cokoli jiného skončí chybou `22P02`
 * a odpovědí 500. Pro cizí adresu je správná odpověď 404 — a navíc se tím
 * do databáze vůbec nechodí.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) {
    return new NextResponse('Neautorizovaný přístup', { status: 401 })
  }

  if (!UUID.test(params.id)) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })

  const metaRows = await adminDb<Meta>`
    SELECT md5(pdf_data) AS etag, octet_length(pdf_data) AS size, pdf_filename, invoice_number, pdf_generated
    FROM invoices
    WHERE id = ${params.id}
    LIMIT 1
  `
  const meta = metaRows[0]
  if (!meta) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })

  // Vystavená faktura, která se ještě nikdy netiskla: vyrobit a uložit.
  if (meta.etag === null) {
    if (!meta.pdf_generated) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })
    return generate(params.id, meta.invoice_number)
  }

  const filename = meta.pdf_filename || `faktura-${meta.invoice_number}.pdf`
  const etag = `"${meta.etag}"`
  const headers = {
    'Content-Type': 'application/pdf',
    // filename* kvůli diakritice v názvu souboru
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ETag: etag,
    // `private` = jen prohlížeč, nikdy sdílená cache; `max-age=0,
    // must-revalidate` = při každém otevření se ověří ETag, takže přepsané
    // PDF se nikdy neukáže staré. Dřív `no-store`, viz DECISIONS #022.
    'Cache-Control': 'private, max-age=0, must-revalidate',
  }

  // Prohlížeč už ten dokument má — nebudeme ho číst z databáze ani posílat.
  if (matchesEtag(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers })
  }

  const dataRows = await adminDb<{ pdf_base64: string }>`
    SELECT encode(pdf_data, 'base64') AS pdf_base64
    FROM invoices
    WHERE id = ${params.id} AND pdf_data IS NOT NULL
    LIMIT 1
  `
  const row = dataRows[0]
  // Mezi dotazy mohl někdo fakturu smazat.
  if (!row) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })

  const buffer = Buffer.from(row.pdf_base64, 'base64')
  return new NextResponse(buffer, {
    headers: { ...headers, 'Content-Length': String(buffer.byteLength) },
  })
}

/** `If-None-Match` smí nést víc značek a předponu `W/`. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .includes(etag)
}

/**
 * Vyrobí PDF vystavené faktury, uloží ho k dokladu a rovnou pošle.
 * Uložení je jen cache: když selže, dokument se stejně odešle a příště
 * se vygeneruje znovu.
 */
async function generate(id: string, invoiceNumber: string): Promise<NextResponse> {
  const doc = await loadInvoiceDoc(id)
  if (!doc) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })

  const profile = await loadIssuerProfile()
  let pdf: Buffer
  try {
    pdf = await renderInvoicePdf(doc, { name: profile.name || 'ZakazIQ', logo: null })
  } catch (err) {
    console.error('[faktury] PDF se nepodařilo vyrobit:', err)
    return new NextResponse('PDF se teď nepodařilo vyrobit. Zkuste to prosím znovu.', { status: 503 })
  }

  const filename = `faktura-${invoiceNumber}.pdf`
  try {
    await adminDb`
      UPDATE invoices
      SET pdf_data = decode(${pdf.toString('base64')}::text, 'base64'),
          pdf_filename = ${filename},
          pdf_size = ${pdf.byteLength}
      WHERE id = ${id}
    `
  } catch (err) {
    console.error('[faktury] PDF se nepodařilo uložit k dokladu:', err)
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ETag: `"${createHash('md5').update(pdf).digest('hex')}"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Content-Length': String(pdf.byteLength),
    },
  })
}
