import 'server-only'
import { createHmac, randomBytes } from 'crypto'

// Pozvánky do klientského prostoru (KP05). Kód ukáže admin jednou, v DB je jen
// HMAC-SHA256 s pepřem PORTAL_INVITE_PEPPER (min. 32 znaků; bez něj pozvánky
// nejdou vytvořit ani uplatnit). Kód je jednorázový a platí INVITE_VALID_DAYS dní.

export const INVITE_VALID_DAYS = 14
const CODE_RE = /^zi_[A-Za-z0-9]{32}$/
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export class InviteConfigError extends Error {
  constructor() {
    super('Chybí PORTAL_INVITE_PEPPER (min. 32 znaků) — pozvánky nejdou vytvořit ani uplatnit.')
  }
}

function pepper(): string {
  const value = process.env.PORTAL_INVITE_PEPPER ?? ''
  if (value.length < 32) throw new InviteConfigError()
  return value
}

export const isInviteConfigured = (): boolean => (process.env.PORTAL_INVITE_PEPPER ?? '').length >= 32

export const isInviteCodeShape = (code: string): boolean => CODE_RE.test(code)

export function hashInviteCode(code: string): string {
  return createHmac('sha256', pepper()).update(code).digest('hex')
}

export function generateInviteCode(): { code: string; hash: string } {
  let token = ''
  while (token.length < 32) {
    for (const byte of randomBytes(64)) {
      if (byte < 248 && token.length < 32) token += ALPHABET[byte % 62]
    }
  }
  const code = `zi_${token}`
  return { code, hash: hashInviteCode(code) }
}

export const inviteExpiry = (now: Date = new Date()): Date =>
  new Date(now.getTime() + INVITE_VALID_DAYS * 86_400_000)
