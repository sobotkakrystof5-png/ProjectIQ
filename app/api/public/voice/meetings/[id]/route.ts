import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { WRITE_MAX_BYTES, authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { deleteMeeting, loadMeeting, setDeviceMeetingContact } from '@/lib/admin/voice/meetings'
import { readJsonLimited } from '@/lib/security/request-body'

// ZakazIQ Voice — schůzky (R-151): GET přepis a shrnutí, PATCH přiřadí schůzku
// ke kontaktu, DELETE smaže schůzku i s přepisem. Jen schůzky tohoto zařízení.

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

const patchSchema = z.object({ contactId: z.string().uuid().nullable() }).strict()

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'write')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')
  const body = await readJsonLimited(req, WRITE_MAX_BYTES)
  if (!body.ok) return body.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const parsed = patchSchema.safeParse(body.value)
  if (!parsed.success) return voiceFail(400, 'INVALID_BODY')
  try {
    const result = await setDeviceMeetingContact(id.data, auth.device.id, parsed.data.contactId)
    if (result === 'no-meeting') return voiceFail(404, 'NOT_FOUND')
    if (result === 'no-contact') return voiceFail(404, 'CONTACT_NOT_FOUND')
    return voiceOk({ meeting: await loadMeeting(id.data, auth.device.id) })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/id] přiřazení ke kontaktu selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
