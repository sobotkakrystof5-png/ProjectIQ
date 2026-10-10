import { NextResponse } from 'next/server'
import { z } from 'zod'
import { wsDb } from '@/lib/ws/db'
import { clientIp, hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'
import { getInvoice } from '@/lib/ws/money/data'
import { renderInvoicePdf } from '@/lib/ws/money/pdf'
import { resolvePortal } from '@/lib/ws/portal'

// Faktura k zakázce z klientského portálu (S16). Jen vystavená nebo zaplacená
// faktura právě téhle zakázky a jen se zapnutými Fakturami; cokoli jiného
// = stejná 404. Oprávnění dává jen token zakázky.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const GONE = () => new NextResponse('Faktura tu není.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export async function GET(req: Request, { params }: { params: { token: string; id: string } }) {
  const id = z.string().uuid().safeParse(params.id)
  if (!id.success) return GONE()
  if (await hitLimit(LIMITS.portalPdfPerIp, clientIp(req.headers))) {
    return new NextResponse('Zkuste fakturu stáhnout za pár minut.', { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  try {
    const ref = await resolvePortal(params.token)
    if (!ref || ref.kind !== 'job') return GONE()
    const scope = { userId: 'system:portal', accountId: ref.accountId, role: 'staff' as const }
    const [biz] = await wsDb(scope)`
      SELECT b.name, b.logo_url,
        EXISTS (SELECT 1 FROM ws.business_modules m WHERE m.account_id = b.account_id AND m.business_id = b.id AND m.module = 'invoices' AND m.enabled) AS invoices
      FROM ws.businesses b WHERE b.account_id = ${ref.accountId} AND b.id = ${ref.businessId}`
    if (!biz?.invoices) return GONE()
    const invoice = await getInvoice(scope, { id: ref.businessId }, id.data)
    if (!invoice || invoice.jobId !== ref.id || invoice.direction !== 'issued' || !['issued', 'paid'].includes(invoice.status)) return GONE()
    let pdf: Buffer
    if (invoice.hasPdf) {
      const [r] = await wsDb(scope)`SELECT encode(pdf_data, 'base64') AS data FROM ws.invoices
        WHERE account_id = ${ref.accountId} AND business_id = ${ref.businessId} AND id = ${id.data}`
      pdf = Buffer.from(String(r.data), 'base64')
    } else {
      pdf = await renderInvoicePdf(invoice, { name: String(biz.name), logo: (biz.logo_url as string | null) ?? null })
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`faktura-${invoice.number}.pdf`)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (e) {
    console.error('ws.portal.pdf', { error: e instanceof Error ? e.message : 'unknown' })
    return new NextResponse('Fakturu se nepodařilo připravit. Zkuste to prosím znovu.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
