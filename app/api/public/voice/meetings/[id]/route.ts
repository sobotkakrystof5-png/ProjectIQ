import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { deleteMeeting, loadMeeting } from '@/lib/admin/voice/meetings'

// ZakazIQ Voice — schůzky (R-151): GET přepis a shrnutí, DELETE smaže schůzku
// i s přepisem. Jen schůzky tohoto zařízení.

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const idSchema = z.string().uuid()

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'stats')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')
  try {
    const meeting = await loadMeeting(id.data, auth.device.id)
    if (!meeting) return voiceFail(404, 'NOT_FOUND')
    return voiceOk({ meeting })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/id] čtení selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'write')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')
  try {
    if (!(await deleteMeeting(id.data, auth.device.id))) return voiceFail(404, 'NOT_FOUND')
    return voiceOk({ deleted: true })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/id] mazání selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
