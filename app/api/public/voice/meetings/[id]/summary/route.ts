import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { summarizeMeeting } from '@/lib/admin/voice/meeting-summary'
import { loadMeeting, saveMeetingSummary } from '@/lib/admin/voice/meetings'

// ZakazIQ Voice — schůzky (R-151): shrnutí přepisu modelem, jen na kliknutí.
// Výsledek se uloží ke schůzce a vrátí se celá schůzka.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const idSchema = z.string().uuid()

const FAIL: Record<'NOT_CONFIGURED' | 'EMPTY' | 'REFUSED' | 'TRUNCATED' | 'FAILED', number> = {
  NOT_CONFIGURED: 503,
  EMPTY: 409,
  REFUSED: 422,
  TRUNCATED: 502,
  FAILED: 502,
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'summary')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')
  try {
    const meeting = await loadMeeting(id.data, auth.device.id)
    if (!meeting) return voiceFail(404, 'NOT_FOUND')
    const res = await summarizeMeeting(meeting.transcript, meeting.startedAt)
    if (!res.ok) return voiceFail(FAIL[res.code], `SUMMARY_${res.code}`)
    await saveMeetingSummary(id.data, res.summary, res.model, res.costUsd)
    return voiceOk({ meeting: await loadMeeting(id.data, auth.device.id) })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/summary] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
