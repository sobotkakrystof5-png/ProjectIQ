import { NextRequest, NextResponse } from 'next/server'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { WRITE_MAX_BYTES, authorizeVoiceDevice, startedAtPlausible, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { meetingCreateSchema } from '@/lib/admin/voice/meeting-turn'
import { createMeeting, listMeetings } from '@/lib/admin/voice/meetings'
import { readJsonLimited } from '@/lib/security/request-body'

// ZakazIQ Voice — schůzky (R-151): POST založí schůzku (id vytvoří Mac, opakování
// nic nezdvojí), GET vrátí posledních 100 schůzek tohoto zařízení.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'meeting')
  if (!auth.ok) return auth.res
  const body = await readJsonLimited(req, WRITE_MAX_BYTES)
  if (!body.ok) return body.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const parsed = meetingCreateSchema.safeParse(body.value)
  if (!parsed.success || !startedAtPlausible(parsed.data.startedAt)) return voiceFail(400, 'INVALID_BODY')
  try {
    const own = await createMeeting(parsed.data, auth.device.id)
    if (!own) return voiceFail(404, 'NOT_FOUND')
    return voiceOk({ id: parsed.data.id })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings] založení selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'stats')
  if (!auth.ok) return auth.res
  try {
    return voiceOk({ meetings: await listMeetings(auth.device.id) })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings] výpis selhal:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
