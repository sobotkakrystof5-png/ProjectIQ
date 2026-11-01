// Cesty klientského prostoru (KP05). Bez závislostí, aby je šlo importovat v proxy.ts.
export const PORTAL_HOME_PATH = '/klient'
export const PORTAL_SIGN_IN_PATH = '/klient/prihlaseni'
export const PORTAL_SIGN_UP_PATH = '/klient/registrace'
export const PORTAL_INVITE_PATH = '/klient/pozvanka'
export const PORTAL_NO_ACCESS_PATH = '/klient/bez-pristupu'

/** Stránky /klient dostupné bez přihlášení (pozvánka si přihlášení řeší sama). */
export const PORTAL_PUBLIC_PATHS = [PORTAL_SIGN_IN_PATH, PORTAL_SIGN_UP_PATH, PORTAL_INVITE_PATH, PORTAL_NO_ACCESS_PATH] as const
