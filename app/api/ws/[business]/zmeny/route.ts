import { createHash } from 'crypto'
import { after, NextResponse, type NextRequest } from 'next/server'
import { getChangeStamp } from '@/lib/ws/calendar'
import { loadBusinessScope } from '@/lib/ws/scope'
import { deliver } from '@/lib/ws/email/notify'

// Živé obnovení (S10): otevřená aplikace se sem ptá každých pár sekund
// s If-None-Match. Beze změny 304 bez těla, se změnou nový ETag → prohlížeč
// si načte stránku znovu (router.refresh). Žádná data, jen otisk.
// Zároveň odešle splatné e-maily účtu (S15) — např. po uplynutí „Zpět“ —
// protože Vercel Hobby pustí cron jen jednou denně (R-050). Odesílání běží až
// po odpovědi (`after`), takže dotaz nikdy nečeká na SMTP (RD03); účet a byznys
// přijdou jedním dotazem do DB (`loadBusinessScope`), otisk dalším.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ business: string }> }) {
  const params = await props.params
  const { ctx, business } = await loadBusinessScope(params.business)
  after(async () => {
    try {
      await deliver(ctx, 1500)
    } catch (e) {
      console.error('ws/zmeny: odeslání e-mailů selhalo', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    }
  })
  try {
    const stamp = await getChangeStamp(ctx, business)
    const etag = `"${createHash('sha256').update(`${business.id}|${stamp}`).digest('base64url').slice(0, 22)}"`
    const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
    if (req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
    return new NextResponse(null, { status: 200, headers })
  } catch (e) {
    console.error('ws/zmeny', { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })
    return new NextResponse(null, { status: 503 })
  }
}
