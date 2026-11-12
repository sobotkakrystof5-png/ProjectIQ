import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'

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

type Meta = { etag: string; size: number; pdf_filename: string | null; invoice_number: string }

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) {
    return new NextResponse('Neautorizovaný přístup', { status: 401 })
  }

  const metaRows = await adminDb<Meta>`
    SELECT md5(pdf_data) AS etag, octet_length(pdf_data) AS size, pdf_filename, invoice_number
    FROM invoices
    WHERE id = ${params.id} AND pdf_data IS NOT NULL
    LIMIT 1
  `
  const meta = metaRows[0]
  if (!meta) return new NextResponse('Faktura nebo PDF neexistuje', { status: 404 })

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
