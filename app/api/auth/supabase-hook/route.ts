import { NextResponse, type NextRequest } from 'next/server'

import { readBodyLimited } from '@/lib/security/request-body'
import { verifySvix } from '@/lib/security/webhook-signature'
import { decideSignup, signupPermitLookups, type SignupHookPayload } from '@/lib/supabase/signup-hook'

// Hook Supabase Auth „Before User Created" (R-107, `lib/supabase/signup-hook.ts`).
// Volá ho jen Supabase, podepsaně tajemstvím SUPABASE_AUTH_HOOK_SECRET (Standard
// Webhooks). Fail-closed: bez tajemství, s cizím podpisem nebo při chybě se
// registrace odmítne. Odpověď `{}` = účet smí vzniknout, `{ error }` = nesmí.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 16 * 1024

function refuse(status: number, message: string): NextResponse {
  return NextResponse.json({ error: { http_code: status, message } }, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET
  if (!secret) return refuse(403, 'Registrace teď není možná.')

  const bounded = await readBodyLimited(req, MAX_BODY)
  if (!bounded.ok) return refuse(413, 'Registrace teď není možná.')
  const body = Buffer.from(bounded.bytes).toString('utf8')

  const signed = verifySvix(
    body,
    {
      id: req.headers.get('webhook-id'),
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    },
    secret,
  )
  if (!signed) return refuse(401, 'Registrace teď není možná.')

  let payload: SignupHookPayload
  try {
    payload = JSON.parse(body) as SignupHookPayload
  } catch {
    return refuse(400, 'Registrace teď není možná.')
  }

  try {
    const decision = await decideSignup(payload, signupPermitLookups)
    if (!decision.allow) return refuse(403, decision.message)
    return NextResponse.json({})
  } catch (err) {
    console.error('[supabase-hook] rozhodnutí selhalo:', err instanceof Error ? err.name : 'unknown')
    return refuse(403, 'Registrace teď není možná.')
  }
}
