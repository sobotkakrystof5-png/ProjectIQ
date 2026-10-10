import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized, runDailySegments } from '@/lib/ws/cron'

// Denní přepočet skupin zákazníků a propadlých karet Workspace (S12, vercel.json).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runDailySegments()
  return NextResponse.json({ success: true, ...result })
}
