import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

// Podepsané odkazy v e-mailech (S15). Odkaz nese ID účtu a záznamu
// s podpisem HMAC-SHA256 — bez platného podpisu se nic nenačte, takže účet
// z odkazu je ověřený zdroj (jako klíč webu) a smí nastavit kontext RLS.
//
// Druhy:
//   a — jednorázová akce majitele (Potvrdit / Jiný čas). Platnost a použití
//       hlídá řádek ws.action_tokens, odkaz nese jen jeho ID.
//   u — odhlášení zákazníka z hromadných zpráv (bez expirace).
//   n — odhlášení účtu z novinek ZakazIQ (bez expirace).
//   c — termín do kalendáře (.ics) pro zákazníka.
//
// Klíč se odvozuje z WS_KEY_PEPPER (oddělený účel podpisu) — žádná další
// proměnná prostředí. Změna pepperu zneplatní i odeslané odkazy.

export type LinkKind = 'a' | 'u' | 'n' | 'c'
export type LinkPayload = { kind: LinkKind; accountId: string; id: string | null }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

let cachedKey: Buffer | null = null
let keyOverride: string | null = null

/** Jen pro testy: vlastní pepper. `null` vrátí env. */
export function setLinkSecretForTests(pepper: string | null): void {
  keyOverride = pepper
  cachedKey = null
}

function key(): Buffer {
  if (cachedKey) return cachedKey
  const pepper = keyOverride ?? process.env.WS_KEY_PEPPER
  if (!pepper || pepper.length < 32) throw new Error('Chybí WS_KEY_PEPPER (aspoň 32 znaků) — odkazy v e-mailech nejde podepsat.')
  cachedKey = createHmac('sha256', pepper).update('zakaziq/ws/email-links/v1').digest()
  return cachedKey
}

const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ''), 'hex')
const bytesUuid = (b: Buffer) => {
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const sign = (kind: LinkKind, body: string) =>
  createHmac('sha256', key()).update(`${kind}.${body}`).digest().subarray(0, 18).toString('base64url')

export function signLink(p: LinkPayload): string {
  if (!UUID_RE.test(p.accountId) || (p.id !== null && !UUID_RE.test(p.id))) throw new Error('signLink: neplatné ID')
  const raw = p.id ? Buffer.concat([uuidBytes(p.accountId), uuidBytes(p.id)]) : uuidBytes(p.accountId)
  const body = raw.toString('base64url')
  return `${p.kind}${body}.${sign(p.kind, body)}`
}

/** Ověří podpis a druh. Cokoli jiného = null (bez rozlišení důvodu). */
export function verifyLink(token: unknown, kind: LinkKind): LinkPayload | null {
  if (typeof token !== 'string' || token.length > 120 || token[0] !== kind) return null
  const dot = token.indexOf('.')
  if (dot < 2) return null
  const body = token.slice(1, dot)
  const sig = token.slice(dot + 1)
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null
  let expected: Buffer
  try {
    expected = Buffer.from(sign(kind, body), 'base64url')
  } catch {
    return null
  }
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const raw = Buffer.from(body, 'base64url')
  if (raw.length !== 16 && raw.length !== 32) return null
  return {
    kind,
    accountId: bytesUuid(raw.subarray(0, 16)),
    id: raw.length === 32 ? bytesUuid(raw.subarray(16)) : null,
  }
}

/** Adresa aplikace pro odkazy v e-mailech (cron nemá hlavičky požadavku). */
export function emailOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  return (env && /^https?:\/\//.test(env) ? env : 'https://www.zakaziq.cz').replace(/\/+$/, '')
}

export const actionLinkUrl = (token: string) => `${emailOrigin()}/z/odkaz/${token}`
export const unsubscribeUrl = (token: string) => `${emailOrigin()}/z/odhlasit/${token}`
export const calendarUrl = (token: string) => `${emailOrigin()}/z/kalendar/${token}`
