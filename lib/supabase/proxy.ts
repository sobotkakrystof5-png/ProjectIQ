import type { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config'

// Session Supabase v proxy.ts: ověří JWT z cookie, prošlý token obnoví a nové
// cookies propíše do požadavku (server komponenty je v tomtéž požadavku
// uvidí) i do odpovědi (prohlížeč je uloží). Volá se jen na cestách, kde se
// přihlášení používá — landing page a veřejné stránky Supabase nevolají.

type PendingCookie = { name: string; value: string; options: Record<string, unknown> }

export type ProxySession = {
  userId: string | null
  email: string | null
  /** `aal2` = relace ověřená i druhým faktorem (2FA). */
  aal: 'aal1' | 'aal2' | null
  /** Doplní obnovené cookies (a hlavičky proti cache) do odpovědi, i do přesměrování. */
  apply<T extends NextResponse>(res: T): T
}

const anonymous: ProxySession = { userId: null, email: null, aal: null, apply: (res) => res }

export async function readProxySession(req: NextRequest): Promise<ProxySession> {
  if (!isSupabaseConfigured()) return anonymous

  const pending: PendingCookie[] = []
  const headers: Record<string, string> = {}
  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list, cacheHeaders) => {
        for (const c of list) {
          req.cookies.set(c.name, c.value)
          pending.push(c as PendingCookie)
        }
        Object.assign(headers, cacheHeaders)
      },
    },
  })

  let userId: string | null = null
  let email: string | null = null
  let aal: ProxySession['aal'] = null
  try {
    const { data } = await supabase.auth.getClaims()
    userId = data?.claims?.sub ?? null
    email = typeof data?.claims?.email === 'string' ? data.claims.email : null
    if (userId) aal = data?.claims?.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch (e) {
    // Výpadek Auth serveru = jako nepřihlášený (stránka pošle na přihlášení), nikdy 500.
    console.error('[proxy] ověření session selhalo', { error: e instanceof Error ? e.message : 'unknown' })
  }

  return {
    userId,
    email,
    aal,
    apply(res) {
      for (const c of pending) res.cookies.set(c.name, c.value, c.options)
      for (const [key, value] of Object.entries(headers)) res.headers.set(key, value)
      return res
    },
  }
}
