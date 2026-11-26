import { NextRequest, NextResponse } from 'next/server'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { FEEDBACK_MAX_BYTES, authorizeVoiceDevice, feedbackSchema, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { recordFeedback } from '@/lib/admin/voice/learner'
import { readJsonLimited } from '@/lib/security/request-body'

// ZakazIQ Voice (R-150, VO08): oprava po vložení. Mac pošle, jak vložený úsek
// vypadá chvíli po vložení; server uloží rozdíl po slovech a učí se z něj.
// Jen pro diktát téhož zařízení, jen do 24 h od diktátu a jen dokud má text.

export const dynamic = 'force-dynamic'

const REASON: Record<'not_found' | 'too_old' | 'no_text', { status: number; code: string }> = {
  not_found: { status: 404, code: 'NOT_FOUND' },
  too_old: { status: 409, code: 'TOO_OLD' },
  no_text: { status: 409, code: 'NO_TEXT' },
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'feedback')
  if (!auth.ok) return auth.res

  const body = await readJsonLimited(req, FEEDBACK_MAX_BYTES)
  if (!body.ok) return body.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const parsed = feedbackSchema.safeParse(body.value)
  if (!parsed.success) return voiceFail(400, 'INVALID_BODY')

  try {
    const res = await recordFeedback(parsed.data.id, auth.device.id, parsed.data.editedText)
    if (!res.ok) return voiceFail(REASON[res.reason].status, REASON[res.reason].code)
    return voiceOk({ userEdits: res.userEdits, pairs: res.pairs, learned: res.learned })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    // Jen druh chyby, nikdy text opravy.
    console.error('[voice/feedback] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
