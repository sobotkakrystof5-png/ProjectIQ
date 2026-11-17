import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { googleConfigured, newAuthRequest } from '@/lib/admin/google/oauth'

/**
 * Začátek propojení Google účtu (R-112). Odkaz z Profilu → přesměrování na
 * přihlášení Googlu. `state` a PKCE ověřovač jdou do HttpOnly cookie omezené
 * na `/api/google` a deset minut. Proxy `/api` nehlídá, proto kontrola tady.
 */
const COOKIE = 'g_oauth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const profil = new URL('/dashboard/profil', req.nextUrl.origin)
  if (!(await getAdminSession())) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))
  if (!googleConfigured()) {
    profil.searchParams.set('google', 'chybi-nastaveni')
    return NextResponse.redirect(profil)
  }

  const { url, state, verifier } = newAuthRequest(req.nextUrl.origin)
  const res = NextResponse.redirect(url)
  res.cookies.set(COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    path: '/api/google',
    maxAge: 600,
  })
  return res
}
