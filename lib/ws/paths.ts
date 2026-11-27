// Cesty Workspace, které potřebuje proxy.ts i aplikace. Bez závislostí,
// aby je šlo importovat v proxy.ts bez DB a Supabase.

export const WS_HOME_PATH = '/w'
export const WS_SIGN_IN_PATH = '/w/prihlaseni'
export const WS_SIGN_UP_PATH = '/w/registrace'
export const WS_ONBOARDING_PATH = '/w/novy'
/** Pozvánka vlastníka do účtu, který připravil admin (S17, R-154): /w/pozvanka/<kód>. */
export const WS_INVITE_PATH = '/w/pozvanka'
export const WS_FORGOT_PATH = '/w/zapomenute-heslo'
/** Sem vede odkaz z e-mailu Supabase (nové heslo, přihlášení odkazem). */
export const WS_AUTH_CALLBACK_PATH = '/w/auth/potvrzeni'
/** Nastavení nového hesla — chce session z odkazu, proto není veřejné. */
export const WS_NEW_PASSWORD_PATH = '/w/nove-heslo'

/**
 * Jde se do Workspace zaregistrovat sám z landing page? (R-134, R-154)
 * Do spuštění plateb (Stripe live) ne: účet připravuje Kryštof pozváním z adminu.
 * Přepnutím na `true` se otevře registrace s ověřením e-mailu kódem i průvodce
 * založením firmy pro kohokoli přihlášeného. Landing page čte totéž (`SIGNUP_OPEN`).
 */
export const WS_SIGNUP_OPEN = false

/** Stránky /w dostupné bez přihlášení. `/w/_design` je v produkci 404. */
export const WS_PUBLIC_PATHS = [
  WS_SIGN_IN_PATH,
  WS_SIGN_UP_PATH,
  WS_INVITE_PATH,
  WS_FORGOT_PATH,
  WS_AUTH_CALLBACK_PATH,
  '/w/_design',
] as const

/**
 * Kam po přihlášení. Jen cesta uvnitř `/w` — cokoli jiného (cizí doména,
 * `//host`, zpětné lomítko) by byl otevřený redirect, tak se vrací `/w`.
 */
export function safeWsNext(next: unknown): string {
  if (typeof next !== 'string' || next.length > 300) return WS_HOME_PATH
  if (!/^\/w(?:[/?#]|$)/.test(next) || next.includes('\\') || next.includes('//')) return WS_HOME_PATH
  return next
}

/** Cookie s naposledy otevřeným byznysem (slug), /w podle ní přesměruje. */
export const LAST_BUSINESS_COOKIE = 'ws_byznys'

/** Objednávací stránka byznysu (R-016). Stránku samotnou postaví S11. */
export const orderPagePath = (slug: string) => `/r/${slug}`

/**
 * Slugy, které byznys mít nesmí: pod /w jsou to pevné cesty aplikace a měly
 * by přednost před /w/[byznys]. Nová pevná cesta pod /w = přidat sem.
 */
export const RESERVED_BUSINESS_SLUGS: ReadonlySet<string> = new Set([
  'novy',
  'prihlaseni',
  'registrace',
  'pozvanka',
  'zapomenute-heslo',
  'nove-heslo',
  'auth',
  'ucet',
  'predplatne',
  '_design',
  'api',
  'nastaveni',
  'navody',
])
