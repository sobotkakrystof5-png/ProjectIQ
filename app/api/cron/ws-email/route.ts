import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/ws/cron'
import { runDailyEmails } from '@/lib/ws/email/scheduled'

// Denní e-maily Workspace (S15, vercel.json): připomínky na zítřek, přehledy,
// faktury po splatnosti, limit DPH, novinky a odeslání fronty. Vercel Hobby
// pustí cron jen 1× denně (R-006); během dne odesílají akce a živé obnovení.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runDailyEmails()
  return NextResponse.json({ success: true, ...result })
}
