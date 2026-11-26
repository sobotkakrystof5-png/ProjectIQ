import { NextRequest, NextResponse } from 'next/server'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { loadMacConfig } from '@/lib/admin/voice/store'
import { isSttConfigured } from '@/lib/admin/voice/stt'

// ZakazIQ Voice (R-148): co potřebuje aplikace na Macu — slovník, zkratky
// a styl podle kategorie. Slouží i jako „Vyzkoušet připojení" (plán, oddíl 7).
// `summary` = dnešní slova a série, tatáž čísla jako admin (VO10).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'config')
  if (!auth.ok) return auth.res

  try {
    const { terms, snippets, settings, summary } = await loadMacConfig()
    return voiceOk({
      device: { name: auth.device.name },
      terms: terms.map((t) => ({ id: t.id, term: t.term, heardAs: t.heardAs, source: t.source, uses: t.uses })),
      snippets: snippets.map((s) => ({ id: s.id, trigger: s.trigger, expansion: s.expansion, uses: s.uses })),
      styles: settings.styles,
      cleanupEnabled: settings.cleanupEnabled,
      storeText: settings.storeText,
      transcriptionReady: isSttConfigured(),
      summary,
    })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/config] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
