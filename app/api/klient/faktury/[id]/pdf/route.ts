import { NextRequest, NextResponse } from 'next/server'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { getPortalContext } from '@/lib/portal/context'
import { loadArchivedInvoicePdf, loadClientInvoiceDoc } from '@/lib/portal/money'
import { renderInvoicePdf } from '@/lib/invoice-pdf/render'

/**
 * PDF faktury pro přihlášeného klienta (KP13, DECISIONS #042).
 *
 * Dvě cesty jako v adminu (`app/api/invoices/[id]/pdf`), ale bez spojení
 * vlastníka tabulek:
 *  - **vystavená v adminu** → PDF se vyrobí z projekce `portal.invoices`
 *    stejným rendererem (`lib/invoice-pdf/render.ts`), takže vypadá stejně jako
 *    to, co klient dostal e-mailem,
 *  - **archivní** (nahrané PDF) → bajty vydá jen funkce `portal.invoice_pdf`
 *    po kontrole členství.
 *
 * `proxy.ts` na `/api/klient` nesahá, takže kontrola přihlášení tady je jediná
 * ochrana. Cizí nebo neexistující faktura je vždy 404 — neprozrazuje se, že
 * existuje. ETag nese obsah dokladu: opakované otevření dostane 304 a Chromium
 * se nespouští. Stažení má navíc limit na člena (Chromium stojí čas běhu,
 * archivní PDF bývá velké).
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RENDER_ENDPOINT = 'klient_faktura_pdf'
const RENDER_WINDOW_MINUTES = 10
const RENDER_MAX = 20

const notFound = () => new NextResponse('Faktura nebo PDF neexistuje.', { status: 404 })

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await props.params
  const ctx = await getPortalContext()
  if (!ctx) return new NextResponse('Přihlaste se prosím znovu.', { status: 401 })
  if (!UUID.test(id)) return notFound()

  const doc = await loadClientInvoiceDoc(ctx.clientId, id)
  if (!doc) return notFound()

  // Název souboru skládáme sami z čísla dokladu — nikdy z nahraného názvu.
  const filename = `faktura-${doc.number.replace(/[^0-9A-Za-z-]/g, '') || 'doklad'}.pdf`
  const etag = `"${doc.etag}"`
  const headers = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ETag: etag,
    // Jen prohlížeč, nikdy sdílená cache; při každém otevření se ověří ETag.
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  }

  if (matchesEtag(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers })
  }

  // Limit až za 304: opakované otevření téhož dokladu nic nestojí. Platí pro obě
  // cesty — vyrobení spouští Chromium, archivní PDF jsou až 5 MB z databáze.
  const memberEndpoint = `${RENDER_ENDPOINT}:${ctx.memberId}`
  if (await isApiRateLimited(memberEndpoint, 'member', RENDER_WINDOW_MINUTES, RENDER_MAX)) {
    return new NextResponse('Faktur je teď moc najednou. Zkuste to prosím za pár minut.', { status: 429 })
  }
  await recordApiRequest(memberEndpoint, 'member')

  if (doc.kind === 'archived') {
    const pdf = await loadArchivedInvoicePdf(ctx.clientId, ctx.memberId, id)
    if (!pdf) return notFound()
    return new NextResponse(new Uint8Array(pdf), {
      headers: { ...headers, 'Content-Length': String(pdf.byteLength) },
    })
  }

  try {
    const pdf = await renderInvoicePdf(doc.invoice, { name: doc.invoice.issuer.name, logo: null })
    return new NextResponse(new Uint8Array(pdf), {
      headers: { ...headers, 'Content-Length': String(pdf.byteLength) },
    })
  } catch (err) {
    console.error('[klient] PDF faktury se nepodařilo vyrobit.', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    return new NextResponse('PDF se nepovedlo připravit. Zkuste to prosím znovu.', { status: 503 })
  }
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
