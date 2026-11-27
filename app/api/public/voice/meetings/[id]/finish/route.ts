import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { WRITE_MAX_BYTES, authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { meetingFinishSchema } from '@/lib/admin/voice/meeting-turn'
import { finishMeeting, loadMeeting } from '@/lib/admin/voice/meetings'
import { readJsonLimited } from '@/lib/security/request-body'

// ZakazIQ Voice — schůzky (R-151): konec schůzky. Vrátí přepis, jak je
// v tu chvíli (promluvy, které ještě čekají ve frontě Macu, přibydou později).

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const idSchema = z.string().uuid()

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'meeting')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')
  const body = await readJsonLimited(req, WRITE_MAX_BYTES)
  if (!body.ok) return body.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const parsed = meetingFinishSchema.safeParse(body.value)
  if (!parsed.success) return voiceFail(400, 'INVALID_BODY')
  try {
    if (!(await finishMeeting(id.data, auth.device.id, parsed.data.endedAt, parsed.data.durationMs))) return voiceFail(404, 'NOT_FOUND')
    return voiceOk({ meeting: await loadMeeting(id.data, auth.device.id) })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/finish] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
