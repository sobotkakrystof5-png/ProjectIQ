import { NextRequest, NextResponse } from 'next/server'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { STATS_RANGES, loadMacStats, type StatsRange } from '@/lib/admin/voice/queries'

// ZakazIQ Voice (R-150, VO10): čísla pro okno na Macu (Domů) — stejná jako
// admin `/dashboard/voice`, ze stejných dotazů (lib/admin/voice/queries.ts).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'stats')
  if (!auth.ok) return auth.res

  const raw = req.nextUrl.searchParams.get('range') ?? '7d'
  if (!(STATS_RANGES as readonly string[]).includes(raw)) return voiceFail(400, 'INVALID_RANGE')

  try {
    return voiceOk({ ...(await loadMacStats(raw as StatsRange)) })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/stats] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
