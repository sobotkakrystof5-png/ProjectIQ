import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isMissingVoiceSchema } from '@/lib/admin/voice/devices'
import { WRITE_MAX_BYTES, authorizeVoiceDevice, voiceFail, voiceOk } from '@/lib/admin/voice/http'
import { deleteTerm, saveSnippet, saveTerm, snippetInput, termInput } from '@/lib/admin/voice/manage'
import { loadMacConfig } from '@/lib/admin/voice/store'
import { readJsonLimited } from '@/lib/security/request-body'

// ZakazIQ Voice (R-150, VO08): slovník a zkratky z okna na Macu. Stejná pravidla
// jako v adminu (`lib/admin/voice/manage.ts`), zápis má vlastní limit (`write`).

export const dynamic = 'force-dynamic'

const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('term'), id: z.string().uuid().nullable().optional(), term: z.string(), heardAs: z.array(z.string()).max(10).default([]) }).strict(),
  z.object({ kind: z.literal('snippet'), id: z.string().uuid().nullable().optional(), term: z.string(), expansion: z.string() }).strict(),
])

function failed(err: unknown, what: string): NextResponse {
  if (isMissingVoiceSchema(err)) return voiceFail(503, 'NOT_CONFIGURED')
  console.error(`[voice/terms] ${what} selhalo:`, err instanceof Error ? err.name : 'unknown')
  return voiceFail(500, 'INTERNAL')
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'config')
  if (!auth.ok) return auth.res
  try {
    const { terms, snippets } = await loadMacConfig()
    return voiceOk({ terms, snippets })
  } catch (err) {
    return failed(err, 'čtení')
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'write')
  if (!auth.ok) return auth.res
  const body = await readJsonLimited(req, WRITE_MAX_BYTES)
  if (!body.ok) return body.reason === 'too-large' ? voiceFail(413, 'TOO_LARGE') : voiceFail(400, 'INVALID_BODY')
  const parsed = bodySchema.safeParse(body.value)
  if (!parsed.success) return voiceFail(400, 'INVALID_BODY')

  try {
    const p = parsed.data
    const input =
      p.kind === 'term'
        ? termInput.safeParse({ id: p.id ?? null, term: p.term, heardAs: p.heardAs })
        : snippetInput.safeParse({ id: p.id ?? null, trigger: p.term, expansion: p.expansion })
    if (!input.success) return voiceFail(400, 'INVALID_BODY')
    const res = p.kind === 'term' ? await saveTerm(input.data as z.infer<typeof termInput>) : await saveSnippet(input.data as z.infer<typeof snippetInput>)
    if (res === 'duplicate') return voiceFail(409, 'DUPLICATE')
    if (res === 'gone') return voiceFail(404, 'NOT_FOUND')
    return voiceOk({})
  } catch (err) {
    return failed(err, 'zápis')
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeVoiceDevice(req, 'write')
  if (!auth.ok) return auth.res
  const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get('id'))
  if (!id.success) return voiceFail(400, 'INVALID_BODY')
  try {
    return (await deleteTerm(id.data)) ? voiceOk({}) : voiceFail(404, 'NOT_FOUND')
  } catch (err) {
    return failed(err, 'smazání')
  }
}
