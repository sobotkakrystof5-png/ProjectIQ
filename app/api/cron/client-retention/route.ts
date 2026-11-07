import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/api-auth'
import { purgeClientRetention } from '@/lib/client-retention'

// Denní úklid dat klientů po dokončených zakázkách (D-K10, R-076, vercel.json).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await purgeClientRetention()
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('cron.client-retention: úklid selhal', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ success: false, error: 'Retention failed' }, { status: 500 })
  }
}
