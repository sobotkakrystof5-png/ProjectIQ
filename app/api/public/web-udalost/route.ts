import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientIp } from '@/lib/api-auth'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { bearerFrom, isAgentKeyConfigured } from '@/lib/agent-keys'
import { recordWebEvent, resolveWebKey } from '@/lib/client-web/keys'

// Událost z webu klienta (KP17, D-K20 = jen počet, R-129, migrace 126).
//
// Server webu, který Kryštof klientovi postavil, sem po úspěšném odeslání
// formuláře pošle `{ "druh": "poptavka" | "objednavka" }` s klíčem webu
// zakázky v `Authorization: Bearer zk_web_…`. Ukládá se jen druh a čas —
// žádné jméno, kontakt, text ani IP. Poptávka sama jde klientovi e-mailem
// jako dřív; tenhle vstup nikdy nezakládá zakázku ani poptávku v adminu
// (to dělá jiná cesta, `lib/web-leads.ts`, a weby klientů na ni nesmí).
//
// Volá se jen ze serveru: požadavek s hlavičkou Origin (prohlížeč) se odmítne,
// aby klíč neskončil v JavaScriptu stránky. CORS záměrně není. Odpovědi
// neprozrazují, jestli zakázka existuje.

const IP_ENDPOINT = 'web_event_ip'
// Weby klientů běží na sdílených adresách hostingu (Vercel) — limit na IP je
// jen hrubá pojistka proti hádání klíčů, hlavní je limit na klíč.
const IP_WINDOW_MINUTES = 60
const IP_MAX = 300
const KEY_WINDOW_MINUTES = 60
const KEY_MAX = 60
const MAX_BODY_BYTES = 1024

const bodySchema = z
  .object({
    druh: z.enum(['poptavka', 'objednavka']),
    test: z.boolean().optional(),
  })
  .strict()

function fail(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, code }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAgentKeyConfigured()) return fail(503, 'NOT_CONFIGURED')
  // Prohlížeč posílá Origin u každého POST z cizí stránky; server webu ne.
  if (req.headers.get('origin')) return fail(403, 'SERVER_ONLY')

  const ip = getClientIp(req)
  // Počítá se každé volání včetně neúspěšných, aby šlo omezit i hádání klíčů.
  if (await isApiRateLimited(IP_ENDPOINT, ip, IP_WINDOW_MINUTES, IP_MAX)) return fail(429, 'RATE_LIMITED')
  await recordApiRequest(IP_ENDPOINT, ip)

  const key = bearerFrom(req.headers.get('authorization'))
  const resolved = key ? await resolveWebKey(key) : null
  if (!resolved) return fail(401, 'UNAUTHORIZED')

  const keyEndpoint = `web_event_key:${resolved.keyId}`
  if (await isApiRateLimited(keyEndpoint, 'key', KEY_WINDOW_MINUTES, KEY_MAX)) return fail(429, 'RATE_LIMITED')
  await recordApiRequest(keyEndpoint, 'key')

  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'TOO_LARGE')
  // Content-Length může chybět nebo lhát (chunked) — délka se ověří i na skutečném těle.
  let text: string
  try {
    text = await req.text()
  } catch {
    return fail(400, 'INVALID_BODY')
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return fail(413, 'TOO_LARGE')

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail(400, 'INVALID_BODY')
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return fail(400, 'INVALID_BODY')

  await recordWebEvent(resolved, parsed.data.druh, parsed.data.test === true)
  return NextResponse.json({ ok: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
}
