import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { PORTAL_FORGOT_PATH, safePortalNext } from '@/lib/portal/paths'

// Odkaz z e-mailu Supabase (změna hesla, případně potvrzení e-mailu) — R-107.
// Vymění jednorázový kód za session a pošle dál, jen v rámci /klient.

export const dynamic = 'force-dynamic'

const OTP_TYPES: ReadonlySet<string> = new Set(['recovery', 'signup', 'email', 'invite', 'magiclink', 'email_change'])

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl
  const next = safePortalNext(url.searchParams.get('next'))
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  const supabase = await createSupabaseServerClient()
  let ok = false
  if (code && code.length <= 200) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && tokenHash.length <= 200 && type && OTP_TYPES.has(type)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })).error
  }

  return NextResponse.redirect(new URL(ok ? next : PORTAL_FORGOT_PATH, url.origin))
}
