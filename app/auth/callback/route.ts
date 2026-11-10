import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/redirect'
import { WS_HOME_PATH, WS_SIGN_IN_PATH } from '@/lib/ws/paths'
import { PORTAL_SIGN_IN_PATH } from '@/lib/portal/paths'

// Návrat ze Supabase Auth (R-080): Google přihlášení, potvrzení registrace,
// pozvánka a odkaz na nové heslo. Umí oba tvary odkazu:
//   ?code=…                     PKCE (Google, výchozí e-mailové šablony Supabase)
//   ?token_hash=…&type=…        vlastní e-mailové šablony (docs/supabase/emaily)
// Po úspěchu přesměruje na `next` (jen naše cesty, lib/auth/redirect.ts).

export const dynamic = 'force-dynamic'

const OTP_TYPES: ReadonlySet<string> = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'])

/** Kam se vrátit, když odkaz neplatí: přihlášení té části aplikace, kam člověk mířil. */
function signInFor(next: string): string {
  if (next.startsWith('/klient')) return PORTAL_SIGN_IN_PATH
  if (next.startsWith('/dashboard') || next.startsWith('/alteno') || next.startsWith('/hub')) return '/login'
  return WS_SIGN_IN_PATH
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const next = safeNextPath(params.get('next'), WS_HOME_PATH)
  const code = params.get('code')
  const tokenHash = params.get('token_hash')
  const type = params.get('type')

  let ok = false
  try {
    const supabase = await createSupabaseServerClient()
    if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error
    } else if (tokenHash && type && OTP_TYPES.has(type)) {
      ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })).error
    }
  } catch (e) {
    console.error('[auth/callback] ověření odkazu selhalo', { error: e instanceof Error ? e.message : 'unknown' })
  }

  if (!ok) {
    const back = new URL(signInFor(next), req.nextUrl.origin)
    back.searchParams.set('chyba', 'odkaz')
    back.searchParams.set('next', next)
    return NextResponse.redirect(back)
  }
  return NextResponse.redirect(new URL(next, req.nextUrl.origin))
}
