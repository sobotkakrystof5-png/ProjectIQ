import { NextRequest, NextResponse } from 'next/server'
import { verifyBearerApiKey, verifyCronSecret } from '@/lib/api-auth'
import { processDueReminders } from '@/lib/admin/meeting-reminders'
import { sendOverdueInvites } from '@/lib/admin/meetings'

// Připomínky schůzek e-mailem a SMS (R-137). Volá ho **každou minutu externí
// cron** (cron-job.org), protože Vercel Hobby pustí vlastní cron jen jednou
// denně (R-006). Vlastní klíč `MEETING_REMINDERS_SECRET`: kdyby u třetí
// strany unikl, umí jen poslat připomínky, kterým už nadešel čas — nic, co
// hlídá `CRON_SECRET` (úklid dat, výmazy, faktury). `CRON_SECRET` projde
// taky, ať jde endpoint zavolat i z denního cronu Vercelu.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  return verifyBearerApiKey(req, 'MEETING_REMINDERS_SECRET') || verifyCronSecret(req)
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Nejvýš 10 zpráv na běh: každé odeslání může čekat až 10 s a běh smí
    // trvat 60 s. Zbytek pošle další běh za minutu.
    const reminders = await processDueReminders({ limit: 10 })
    // Pozvánky, které po 15 s odkladu neodešly (spadlá funkce): každou minutu
    // místo jednou denně.
    const invites = await sendOverdueInvites().catch((err) => {
      console.error('[cron] meeting-reminders: pojistka pozvánek selhala', (err as Error).message)
      return 0
    })
    return NextResponse.json({ success: true, ...reminders, invites })
  } catch (e) {
    console.error('cron.meeting-reminders: odeslání selhalo', { error: e instanceof Error ? e.message : 'unknown' })
    return NextResponse.json({ success: false, error: 'Reminders failed' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
