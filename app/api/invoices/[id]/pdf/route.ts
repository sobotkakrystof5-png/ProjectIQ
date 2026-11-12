import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { isIssuingReady, loadIssuedInvoiceForPdf } from '@/lib/admin/invoice-issue'
import { renderInvoicePdf } from '@/lib/invoice-pdf/render'

/**
 * Servírování PDF faktury.
 *
 * Dvě cesty podle toho, odkud doklad je:
 *  - **archiv** (nahrané cizí PDF) → bajty z `pdf_data`,
 *  - **vystaveno v adminu** (AD12, `number_seq IS NOT NULL`) → PDF se vyrobí
 *    teď, ze snímku dodavatele a položek. Neukládá se: doklad je neměnný,
 *    takže z týchž dat vznikne vždy totéž, a v databázi by zbytečně ležely
 *    megabajty.
 *
 * `proxy.ts` hlídá jen `/dashboard` (a `/alteno`, `/hub` jako pojistku) — na `/api`
 * nesahá. Auth check tady proto není pojistka navíc, ale jediná ochrana:
 * faktura nese údaje klienta (IČO, DIČ, adresu) a nesmí uniknout ven.
 *
 * Dva dotazy, ne jeden (AD08): nejdřív se přečte jen `md5(pdf_data)` a název,
 * a když prohlížeč posílá stejný `If-None-Match`, odpoví se 304 a **bajty se
 * z databáze vůbec netahají**. U vystavené faktury ETag nese obsah dokladu,
 * takže opakované otevření nespouští Chromium znovu.
 *
 * `bytea` se čte jako base64 — neonový HTTP driver vrací binární sloupce
 * jako escapovaný text, přes `encode()` je výsledek jednoznačný. Streamovat
 * ho nejde: HTTP driver vrací celou odpověď jedním JSONem, takže by „stream"
 * byl jen jiný obal nad stejným bufferem. Skutečný stream by znamenal
 * připojení přes Pool (WebSocket na Vercelu) — to je samostatné rozhodnutí.
 */

export const runtime = 'nodejs'
// Megabajtový dokument na pomalé lince nesmí spadnout na výchozím limitu —
// a od AD12 se tu u vystavené faktury navíc rozjíždí Chromium.
export const maxDuration = 60

type Meta = {
  etag: string | null
  pdf_filename: string | null
  invoice_number: string
  number_seq: number | null
  /** Otisk obsahu vystaveného dokladu — mění se jen zaplacením nebo stornem. */
  issued_etag: string
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

  // Dokud nedoběhne migrace 107, nové sloupce v databázi nejsou — route se
  // pak chová přesně jako dřív a servíruje jen nahraná PDF (AD12).
  const issuing = await isIssuingReady()
  const metaRows = issuing
    ? await adminDb<Meta>`
        SELECT md5(pdf_data) AS etag, pdf_filename, invoice_number, number_seq,
               md5(invoice_number
                   || coalesce(updated_at::text, created_at::text, '')
                   || coalesce(paid_on::text, '')
                   || coalesce(cancelled_at::text, '')) AS issued_etag
        FROM invoices
        WHERE id = ${params.id}
        LIMIT 1
      `
    : await adminDb<Meta>`
        SELECT md5(pdf_data) AS etag, pdf_filename, invoice_number,
               NULL::integer AS number_seq, '' AS issued_etag
        FROM invoices
        WHERE id = ${params.id} AND pdf_data IS NOT NULL
        LIMIT 1
      `
  const meta = metaRows[0]
  if (!meta || (meta.etag === null && meta.number_seq === null)) {
    return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })
  }

  const stored = meta.etag !== null
  const filename = meta.pdf_filename || `faktura-${meta.invoice_number}.pdf`
  const etag = `"${stored ? meta.etag : meta.issued_etag}"`
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

  // Prohlížeč už ten dokument má — nebudeme ho číst z databáze ani vyrábět.
  if (matchesEtag(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers })
  }

  if (!stored) {
    const issued = await loadIssuedInvoiceForPdf(params.id)
    // Mezi dotazy mohl někdo fakturu smazat.
    if (!issued) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })
    try {
      const pdf = await renderInvoicePdf(issued.invoice, { name: issued.invoice.issuer.name, logo: null })
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          ...headers,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(issued.filename)}`,
          'Content-Length': String(pdf.byteLength),
        },
      })
    } catch (err) {
      console.error('[Faktury] PDF se nepodařilo vyrobit.', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
      return new NextResponse('PDF se nepovedlo připravit. Zkuste to prosím znovu.', { status: 503 })
    }
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
