import 'server-only'
import { createHmac, randomBytes } from 'crypto'

// Kód pozvánky vlastníka do účtu (migrace 100, R-080). V DB (ws.account_invites)
// je jen HMAC s pepřem WS_KEY_PEPPER; kód jde jen v odkazu z e-mailu.
// Vytváří admin (lib/ws/admin/invite.ts), uplatňuje /w/pozvanka/[kod].

export const ACCOUNT_INVITE_VALID_DAYS = 14
const CODE_RE = /^zw_[A-Za-z0-9]{32}$/
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export class InviteConfigError extends Error {
  constructor() {
    super('Chybí WS_KEY_PEPPER (min. 32 znaků) — pozvánky do účtu nejdou vytvořit ani uplatnit.')
  }
}

export function invitePepper(): string {
  const value = process.env.WS_KEY_PEPPER ?? ''
  if (value.length < 32) throw new InviteConfigError()
  return value
}

export const isAccountInviteCode = (code: string): boolean => CODE_RE.test(code)

/** Doménově oddělený HMAC (nikdy se nepotká s hashem tajných klíčů webu). */
export function hashAccountInviteCode(code: string): string {
  return createHmac('sha256', invitePepper()).update(`account-invite:${code}`).digest('hex')
}

export function generateAccountInviteCode(): { code: string; hash: string } {
  let token = ''
  while (token.length < 32) {
    for (const byte of randomBytes(64)) {
      if (byte < 248 && token.length < 32) token += ALPHABET[byte % 62]
    }
  }
  const code = `zw_${token}`
  return { code, hash: hashAccountInviteCode(code) }
}
