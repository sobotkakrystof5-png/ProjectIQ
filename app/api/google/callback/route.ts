import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { completeAuth } from '@/lib/admin/google/oauth'

/**
 * Návrat z přihlášení Googlu (R-112). Kód se vymění za tokeny jen tehdy,
 * když sedí `state` z cookie (CSRF) a je přihlášený admin. Výsledek ukáže
 * Profil přes `?google=…`; podrobnosti chyby se do adresy nedávají.
 */
const COOKIE = 'g_oauth'

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin
  const back = (result: string) => {
    const url = new URL('/dashboard/profil', origin)
    url.searchParams.set('google', result)
    const res = NextResponse.redirect(url)
    res.cookies.set(COOKIE, '', { path: '/api/google', maxAge: 0 })
    return res
  }

  if (!(await getAdminSession())) return NextResponse.redirect(new URL('/login', origin))

  const params = req.nextUrl.searchParams
  if (params.get('error')) return back('zamitnuto')

  const code = params.get('code') ?? ''
  const state = params.get('state') ?? ''
  const [cookieState, verifier] = (req.cookies.get(COOKIE)?.value ?? '').split('.')
  if (!code || code.length > 2048 || !state || !cookieState || !verifier || !same(state, cookieState)) {
    return back('neplatne')
  }

  try {
    await completeAuth(code, verifier, origin)
    return back('propojeno')
  } catch (err) {
    console.error('[google] Propojení selhalo:', (err as Error).message)
    return back('chyba')
  }
}
