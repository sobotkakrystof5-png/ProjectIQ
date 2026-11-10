import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/ws/cron'
import { syncSubscription } from '@/lib/ws/billing'
import { runDailyGdpr } from '@/lib/ws/gdpr'

// Denní úklid GDPR Workspace (S18, R-054, vercel.json): faktury vymazaných
// zákazníků po 10 letech, účty po konci zaplaceného období (R-074), zrušené účty po 30 dnech.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runDailyGdpr(syncSubscription)
  return NextResponse.json({ success: true, ...result })
}
