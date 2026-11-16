// Cesty klientského prostoru (KP05, od R-107 přihlášení přes Supabase). Bez
// závislostí, aby je šlo importovat v proxy.ts.
export const PORTAL_HOME_PATH = '/klient'
export const PORTAL_SIGN_IN_PATH = '/klient/prihlaseni'
/** Jen přesměrování na přihlášení — účet se zakládá z pozvánky. */
export const PORTAL_SIGN_UP_PATH = '/klient/registrace'
export const PORTAL_INVITE_PATH = '/klient/pozvanka'
export const PORTAL_NO_ACCESS_PATH = '/klient/bez-pristupu'
export const PORTAL_FORGOT_PATH = '/klient/zapomenute-heslo'
/** Sem vede odkaz z e-mailu se změnou hesla (výměna kódu za session). */
export const PORTAL_AUTH_CALLBACK_PATH = '/klient/auth/potvrzeni'
/** Nastavení nového hesla — chce session z odkazu, proto není veřejné. */
export const PORTAL_NEW_PASSWORD_PATH = '/klient/nove-heslo'

/** Stránky /klient dostupné bez přihlášení (pozvánka si přihlášení řeší sama). */
export const PORTAL_PUBLIC_PATHS = [
  PORTAL_SIGN_IN_PATH,
  PORTAL_SIGN_UP_PATH,
  PORTAL_INVITE_PATH,
  PORTAL_NO_ACCESS_PATH,
  PORTAL_FORGOT_PATH,
  PORTAL_AUTH_CALLBACK_PATH,
] as const

/**
 * Kam po přihlášení. Jen cesta uvnitř `/klient` — cokoli jiného (cizí doména,
 * `//host`, zpětné lomítko) by byl otevřený redirect, tak se vrací přehled.
 */
export function safePortalNext(next: unknown): string {
  if (typeof next !== 'string' || next.length > 300) return PORTAL_HOME_PATH
  if (!/^\/klient(?:[/?#]|$)/.test(next) || next.includes('\\') || next.includes('//')) return PORTAL_HOME_PATH
  return next
}
