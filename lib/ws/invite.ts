import 'server-only'
import { createHmac, randomBytes } from 'crypto'

// Kódy pro přístup do Workspace (R-154): pozvánka vlastníka do účtu, který
// založil admin (S17), a povolení k registraci z landing page. Kód zná jen
// člověk z e-mailu, v DB je HMAC-SHA256 s pepřem PORTAL_INVITE_PEPPER (stejný
// jako u pozvánek do klientského prostoru, s vlastní předponou, takže otisk
// jednoho druhu nikdy neplatí pro druhý). Bez pepře nejde nic vytvořit ani uplatnit.

export const WS_INVITE_VALID_DAYS = 14
/** Povolení k registraci platí, jen dokud člověk opisuje kód z e-mailu. */
export const WS_SIGNUP_PERMIT_MINUTES = 30

const CODE_RE = /^zw_[A-Za-z0-9]{32}$/
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export class WsInviteConfigError extends Error {
  constructor() {
    super('Chybí PORTAL_INVITE_PEPPER (min. 32 znaků) — pozvánky do Workspace nejdou vytvořit ani uplatnit.')
  }
}

function pepper(): string {
  const value = process.env.PORTAL_INVITE_PEPPER ?? ''
  if (value.length < 32) throw new WsInviteConfigError()
  return value
}

export const isWsInviteConfigured = (): boolean => (process.env.PORTAL_INVITE_PEPPER ?? '').length >= 32

export const isWsInviteCodeShape = (code: string): boolean => CODE_RE.test(code)

function randomToken(): string {
  let token = ''
  while (token.length < 32) {
    for (const byte of randomBytes(64)) {
      if (byte < 248 && token.length < 32) token += ALPHABET[byte % 62]
    }
  }
  return token
}

export function hashWsInviteCode(code: string): string {
  return createHmac('sha256', pepper()).update(`ws-invite:${code}`).digest('hex')
}

export function generateWsInviteCode(): { code: string; hash: string } {
  const code = `zw_${randomToken()}`
  return { code, hash: hashWsInviteCode(code) }
}

export const wsInviteExpiry = (now: Date = new Date()): Date => new Date(now.getTime() + WS_INVITE_VALID_DAYS * 86_400_000)

/** Otisk povolení k registraci. Kód nikam neodchází, slouží jen jako náhodná hodnota. */
export function generateSignupPermit(): string {
  return createHmac('sha256', pepper()).update(`ws-signup:${randomToken()}`).digest('hex')
}

/** HMAC e-mailu pro ws.signup_permits — tabulka bez RLS nesmí držet čitelný e-mail. */
export function signupAddressDigest(email: string): string {
  return createHmac('sha256', pepper()).update(`ws-signup-address:${email.trim().toLowerCase()}`).digest('hex')
}

export const signupPermitExpiry = (now: Date = new Date()): Date => new Date(now.getTime() + WS_SIGNUP_PERMIT_MINUTES * 60_000)
