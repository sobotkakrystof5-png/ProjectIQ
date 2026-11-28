import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { meetingContactSuggestions, meetingOwnedBy, searchMeetingContacts } from '@/lib/admin/voice/meetings'

// ZakazIQ Voice — schůzky (R-151): přiřazení ke kontaktu z Macu. Bez `q` vrátí
// návrh z kalendáře (událost ve stejný čas s kontaktem), s `q` (aspoň 2 znaky)
// i výsledky hledání. Vrací jen jméno a firmu, ne e-mail ani telefon.

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const idSchema = z.string().uuid()

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'stats')
  if (!auth.ok) return auth.res
  const id = idSchema.safeParse((await ctx.params).id)
  if (!id.success) return voiceFail(404, 'NOT_FOUND')
  const query = (req.nextUrl.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  try {
    if (!(await meetingOwnedBy(id.data, auth.device.id))) return voiceFail(404, 'NOT_FOUND')
    const [suggested, results] = await Promise.all([
      // Návrh z kalendáře je jen pomoc: když selže, hledání musí fungovat dál.
      meetingContactSuggestions(id.data, auth.device.id).catch((err: unknown) => {
        console.error('[voice/meetings/contacts] návrh selhal:', err instanceof Error ? err.name : 'unknown')
        return []
      }),
      query.length >= 2 ? searchMeetingContacts(query) : Promise.resolve([]),
    ])
    return voiceOk({ suggested, results })
  } catch (err) {
    if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
    console.error('[voice/meetings/contacts] selhalo:', err instanceof Error ? err.name : 'unknown')
    return voiceFail(500, 'INTERNAL')
  }
}
