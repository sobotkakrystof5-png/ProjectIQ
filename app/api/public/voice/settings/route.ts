import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { STYLE_KEYS, VOICE_CATEGORIES } from '@/lib/admin/voice/categories'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { WRITE_MAX_BYTES, authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { saveSettings } from '@/lib/admin/voice/manage'
import { loadMacConfig } from '@/lib/admin/voice/store'
import { readJsonLimited } from '@/lib/security/request-body'

// ZakazIQ Voice (R-148, VO08): nastavení z okna na Macu. Jde měnit jen styl
// podle kategorie, „jen čísla", učení a čištění — strop nákladů, lhůtu textu
// a rychlost psaní mění jen admin.

export const dynamic = 'force-dynamic'

const patchSchema = z
  .object({
    styles: z.partialRecord(z.enum(VOICE_CATEGORIES), z.enum(STYLE_KEYS)),
    storeText: z.boolean(),
    autoLearnTerms: z.boolean(),
    cleanupEnabled: z.boolean(),
  })
  .partial()
  .strict()

function failed(err: unknown): NextResponse {
  if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
  console.error('[voice/settings] selhalo:', err instanceof Error ? err.name : 'unknown')
  return voiceFail(500, 'INTERNAL')
}

const view = (s: Awaited<ReturnType<typeof loadMacConfig>>['settings']) => ({
  styles: s.styles,
  storeText: s.storeText,
  autoLearnTerms: s.autoLearnTerms,
  cleanupEnabled: s.cleanupEnabled,
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'config')
  if (!auth.ok) return auth.res
  try {
    return voiceOk({ settings: view((await loadMacConfig()).settings) })
  } catch (err) {
    return failed(err)
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'write')
  if (!auth.ok) return auth.res
  const body = await readJsonLimited(req, WRITE_MAX_BYTES)
  if (!body.ok) return body.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const parsed = patchSchema.safeParse(body.value)
  if (!parsed.success || !Object.keys(parsed.data).length) return voiceFail(400, 'INVALID_BODY')

  try {
    const current = (await loadMacConfig()).settings
    const { styles, ...rest } = parsed.data
    await saveSettings({ ...rest, ...(styles ? { styles: { ...current.styles, ...styles } } : {}) })
    return voiceOk({ settings: view((await loadMacConfig()).settings) })
  } catch (err) {
    return failed(err)
  }
}
