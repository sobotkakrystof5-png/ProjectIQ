import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/api-auth'
import { syncTaxNews } from '@/lib/tax-news'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Týdenní stažení novinek z legislativy (viz `vercel.json`).
 *
 * Idempotentní: zápis jede přes `ON CONFLICT (source, guid) DO NOTHING`,
 * takže opakovaný běh nezaloží duplicity ani nevrátí do „nepřečtených"
 * novinku, kterou už uživatel odbavil. Ruční spuštění navíc je tedy
 * bezpečné.
 *
 * Feedy jsou veřejné a neautentizované, ale zápis do DB ne — stejná
 * ochrana `CRON_SECRET` jako u ostatních cronů.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncTaxNews()

    // Mrtvý feed nemá shodit celý běh — ostatní zdroje se stáhly a zapsaly.
    // Do odpovědi se ale jmenuje, ať je v logu Vercelu vidět, který to byl.
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/tax-news] Stažení novinek selhalo:', err)
    return NextResponse.json({ error: 'Stažení novinek selhalo' }, { status: 500 })
  }
}
