import { NextResponse } from 'next/server'
import { hasRole, requireWorkspace } from '@/lib/ws/context'
import { wsDb } from '@/lib/ws/db'
import { buildAccountExport } from '@/lib/ws/gdpr'
import { hitLimit } from '@/lib/ws/intake/rate-limit'
import { getInvoice } from '@/lib/ws/money/data'
import { renderInvoicePdf } from '@/lib/ws/money/pdf'
import { pragueToday } from '@/lib/ws/time'

// Export všech dat účtu (S18, GDPR čl. 20): ZIP s CSV a PDF faktur. Jen pro
// majitele. Faktury bez uloženého PDF se vykreslí, dokud zbývá čas; ty, co se
// nevejdou, vypíše CTI-MNE.txt (stáhnout jdou v Penězích).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const ctx = await requireWorkspace()
  if (!hasRole(ctx, 'owner')) return new NextResponse('Data účtu může stáhnout jen majitel.', { status: 403 })
  if (await hitLimit({ name: 'gdpr-export', max: 5, windowSec: 3600 }, ctx.accountId)) {
    return new NextResponse('Export jste stahovali před chvílí. Zkuste to prosím za hodinu.', { status: 429 })
  }

  const brands = new Map(
    (await wsDb(ctx)<{ id: string; name: string; logo_url: string | null }>`SELECT id, name, logo_url FROM ws.businesses WHERE account_id = ${ctx.accountId}`).map(
      (b) => [b.id, b] as const,
    ),
  )
  const renderPdf = async (invoiceId: string): Promise<Uint8Array> => {
    const [row] = await wsDb(ctx)<{ business_id: string }>`SELECT business_id FROM ws.invoices WHERE account_id = ${ctx.accountId} AND id = ${invoiceId}`
    const brand = row && brands.get(row.business_id)
    const invoice = brand && (await getInvoice(ctx, { id: row.business_id }, invoiceId))
    if (!brand || !invoice) throw new Error('faktura nenalezena')
    return renderInvoicePdf(invoice, { name: brand.name, logo: brand.logo_url })
  }

  try {
    const { zip } = await buildAccountExport(ctx, { renderPdf, deadline: Date.now() + 40_000 })
    await wsDb(ctx)`INSERT INTO ws.audit_log (account_id, actor, action, entity) VALUES (${ctx.accountId}, ${ctx.userId}, 'account.export', 'account')`
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="zakaziq-data-${pragueToday()}.zip"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    console.error('[ws/gdpr] export selhal', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return new NextResponse('Export se nepodařilo připravit. Zkuste to prosím za chvíli.', { status: 503 })
  }
}
