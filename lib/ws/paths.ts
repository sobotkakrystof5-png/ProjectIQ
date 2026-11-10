// Cesty Workspace, které potřebuje proxy.ts i aplikace. Bez závislostí,
// aby je šlo importovat v proxy.ts bez DB a Supabase.

export const WS_HOME_PATH = '/w'
export const WS_SIGN_IN_PATH = '/w/prihlaseni'
export const WS_SIGN_UP_PATH = '/w/registrace'
export const WS_ONBOARDING_PATH = '/w/novy'
export const WS_RESET_PATH = '/w/zapomenute-heslo'
export const WS_NEW_PASSWORD_PATH = '/w/nove-heslo'
/** Pozvánka vlastníka do účtu, který založil admin (S17, migrace 100). */
export const WS_INVITE_PATH = '/w/pozvanka'
/** Kód z aplikace po přihlášení, má-li člověk zapnuté 2FA (R-081). */
export const WS_MFA_PATH = '/w/overeni'
/** Přihlášení a zabezpečení: 2FA, heslo, e-mail, odhlášení všude (R-081). */
export const WS_SECURITY_PATH = '/w/zabezpeceni'

/** Cesty pro přihlašovací formulář (components/ws/auth/auth-form.tsx). */
export const WS_AUTH_PATHS = {
  signIn: WS_SIGN_IN_PATH,
  signUp: WS_SIGN_UP_PATH,
  reset: WS_RESET_PATH,
  newPassword: WS_NEW_PASSWORD_PATH,
} as const

/** Stránky /w přístupné bez přihlášení (proxy.ts). Nové heslo a pozvánka si přihlášení hlídají samy. */
export const WS_PUBLIC_PATHS = [WS_SIGN_IN_PATH, WS_SIGN_UP_PATH, WS_RESET_PATH, WS_NEW_PASSWORD_PATH, WS_INVITE_PATH, '/w/_design'] as const

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
  'zapomenute-heslo',
  'nove-heslo',
  'pozvanka',
  'overeni',
  'zabezpeceni',
  'ucet',
  'predplatne',
  '_design',
  'api',
  'nastaveni',
  'navody',
])
