// Cesty klientského prostoru (KP05). Bez závislostí, aby je šlo importovat v proxy.ts.
export const PORTAL_HOME_PATH = '/klient'
export const PORTAL_SIGN_IN_PATH = '/klient/prihlaseni'
export const PORTAL_SIGN_UP_PATH = '/klient/registrace'
export const PORTAL_RESET_PATH = '/klient/zapomenute-heslo'
export const PORTAL_NEW_PASSWORD_PATH = '/klient/nove-heslo'
export const PORTAL_INVITE_PATH = '/klient/pozvanka'
export const PORTAL_NO_ACCESS_PATH = '/klient/bez-pristupu'
/** Kód z aplikace po přihlášení, má-li člověk zapnuté 2FA (R-081). */
export const PORTAL_MFA_PATH = '/klient/overeni'
/** Přihlášení a zabezpečení: 2FA, heslo, e-mail, odhlášení všude (R-081). */
export const PORTAL_SECURITY_PATH = '/klient/zabezpeceni'
/** Zrušená relace (Odhlásit všude): /auth/odhlaseni smaže cookies a pošle na přihlášení. */
export const PORTAL_REVOKED_PATH = '/auth/odhlaseni?kam=klient'

/** Stránky /klient dostupné bez přihlášení (pozvánka si přihlášení řeší sama). */
export const PORTAL_PUBLIC_PATHS = [
  PORTAL_SIGN_IN_PATH,
  PORTAL_SIGN_UP_PATH,
  PORTAL_RESET_PATH,
  PORTAL_NEW_PASSWORD_PATH,
  PORTAL_INVITE_PATH,
  PORTAL_NO_ACCESS_PATH,
] as const

/** Cesty pro přihlašovací formulář (components/ws/auth/auth-form.tsx). */
export const PORTAL_AUTH_PATHS = {
  signIn: PORTAL_SIGN_IN_PATH,
  signUp: PORTAL_SIGN_UP_PATH,
  reset: PORTAL_RESET_PATH,
  newPassword: PORTAL_NEW_PASSWORD_PATH,
} as const
