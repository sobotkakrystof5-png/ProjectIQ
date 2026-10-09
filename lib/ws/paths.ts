// Cesty Workspace, které potřebuje middleware i aplikace. Bez závislostí,
// aby je šlo importovat v middleware (edge) bez DB a Clerku.

export const WS_HOME_PATH = '/w'
export const WS_SIGN_IN_PATH = '/w/prihlaseni'
export const WS_SIGN_UP_PATH = '/w/registrace'
export const WS_ONBOARDING_PATH = '/w/novy'

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
  'ucet',
  'predplatne',
  '_design',
  'api',
  'nastaveni',
])
