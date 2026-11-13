import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { askAssistant, assistantRequestSchema } from '@/lib/ai/assistant'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'

/**
 * Asistent u startupového projektu (AD14).
 *
 * **Co tahle route dělala do AD14:** brala z těla požadavku `systemPrompt`
 * i celé pole `messages` a beze změny je předala modelu. Jediná kontrola
 * bylo přihlášení, model byl natvrdo opus a nic nebylo omezené — ani délka,
 * ani počet zpráv, ani frekvence. Kdo se dostal k přihlášené záložce admina,
 * měl v ruce model na cizí účet.
 *
 * Od teď: tělo přes Zod, systémový prompt a kontext **jen ze serveru**
 * (`lib/ai/prompts.ts`, `lib/ai/context.ts`), model z `lib/ai/models.ts`,
 * rate limit a strop na `max_tokens`. Odpověď se vrací jako prostý text a
 * v prohlížeči se nikdy nevykresluje jako HTML.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

/** Pár dotazů za minutu stačí člověku, co píše. Víc znamená skript. */
const RATE_WINDOW_MINUTES = 1
const RATE_MAX_REQUESTS = 12
const RATE_KEY = 'ai-assistant'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Je to jeden admin (R-001), takže se limit počítá na jeden klíč: IP se
  // mění podle sítě a e-mail by se zbytečně zapisoval do `api_requests`.
  const actor = 'admin'
  if (await isApiRateLimited(RATE_KEY, actor, RATE_WINDOW_MINUTES, RATE_MAX_REQUESTS)) {
    return NextResponse.json({ error: 'Moc dotazů za sebou. Zkus to za chvíli.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neplatný požadavek.' }, { status: 400 })
  }

  // `systemPrompt` ani `messages` v těle nikoho nezajímají: Zod je zahodí
  // a prompt se skládá na serveru podle `mode`.
  const parsed = assistantRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Neplatný požadavek.' }, { status: 400 })
  }

  await recordApiRequest(RATE_KEY, actor)
  const result = await askAssistant(parsed.data)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ content: result.content })
}
