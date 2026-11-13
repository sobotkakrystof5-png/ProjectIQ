import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/api-auth'
import { purgeClientRetention } from '@/lib/client-retention'
import { purgeMemoryRetention } from '@/lib/admin/memory/store'

// Denní úklid dat klientů po dokončených zakázkách (D-K10, R-076, vercel.json).
//
// Od AD15 sem patří i paměť projektu a návrhy asistenta: je to tatáž otázka
// „co už si nemáme pamatovat". Vlastní cron se kvůli tomu nezakládá — Vercel
// Hobby dovolí jeden běh denně (R-006).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await purgeClientRetention()
    // Chybějící migrace 111 vrátí null; úklid klientských dat tím netrpí.
    const memory = await purgeMemoryRetention().catch(() => null)
    return NextResponse.json({ success: true, ...result, memory })
  } catch (e) {
    console.error('cron.client-retention: úklid selhal', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ success: false, error: 'Retention failed' }, { status: 500 })
  }
}
