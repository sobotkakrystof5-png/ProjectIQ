import type { CookieOptions } from '@supabase/ssr'

/**
 * Session adminu v cookie. `@supabase/ssr` dává ve výchozím stavu
 * `httpOnly: false` a `maxAge` 400 dní — obojí je proti dnešnímu NextAuth krok
 * zpět, protože admin čte data všech klientů (DECISIONS #021):
 *
 *  - `httpOnly: true` — token nesmí být čitelný JavaScriptem (XSS by ho jinak
 *    odnesl). Jde to jen proto, že v prohlížeči žádný Supabase klient neběží.
 *  - `secure` mimo vývoj, `sameSite: 'lax'` (přihlášení je POST ze stejného webu).
 *  - `maxAge` nejvýš 12 h, stejně jako měl JWT NextAuthu. Delší platnost na
 *    straně Supabase tím prohlížeči nepomůže — cookie dřív zmizí.
 *
 * Mazání (`maxAge: 0` při odhlášení) projde: `Math.min(0, …)` je 0.
 */
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

export function hardenedCookieOptions(options: CookieOptions | undefined): CookieOptions {
  const maxAge = options?.maxAge
  return {
    ...options,
    path: options?.path ?? '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: typeof maxAge === 'number' ? Math.min(maxAge, ADMIN_SESSION_MAX_AGE_SECONDS) : ADMIN_SESSION_MAX_AGE_SECONDS,
  }
}
