import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { q, wsDb, wsSystem, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'

// Klíče napojení webu (S11, B6, migrace 072).
//
// Veřejný klíč `pk_live_…` je v prohlížeči (widget). Sám nic nedovolí: API ho
// přijme jen z povolené domény (Origin proti allowed_origins).
//
// Tajný klíč `sk_live_<prefix>_<tajemství>` patří jen na server webu
// (env ZAKAZIQ_KEY). Ukáže se jednou při vytvoření; v DB je jen prefix pro
// vyhledání a HMAC-SHA256 s pepřem z WS_KEY_PEPPER. Porovnání v konstantním
// čase. Bez pepře klíč nejde vytvořit ani ověřit (selže zavřeně).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Náhodný řetězec z písmen a číslic (bez zkreslení: zamítá bajty nad 247). */
function randomToken(length: number): string {
  let out = ''
  while (out.length < length) {
    const bytes = randomBytes(length * 2)
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i]
      if (byte < 248 && out.length < length) out += ALPHABET[byte % 62]
    }
  }
  return out
}

const PUBLIC_PREFIX = 'pk_live_'
const SECRET_PREFIX = 'sk_live_'
const SECRET_RE = /^sk_live_([A-Za-z0-9]{10})_([A-Za-z0-9]{32})$/
/** Tvar podle CHECK v migraci 072 (nové klíče jsou pk_live_ + 24 znaků). */
export const PUBLIC_KEY_RE = /^pk_[A-Za-z0-9_-]{20,100}$/

export class KeyConfigError extends Error {
  constructor() {
    super('Chybí WS_KEY_PEPPER (min. 32 znaků) — tajné klíče nejde vytvořit ani ověřit.')
  }
}

function pepper(): string {
  const value = process.env.WS_KEY_PEPPER ?? ''
  if (value.length < 32) throw new KeyConfigError()
  return value
}

export const isKeyConfigured = (): boolean => (process.env.WS_KEY_PEPPER ?? '').length >= 32

export const generatePublicKey = (): string => `${PUBLIC_PREFIX}${randomToken(24)}`

/** HMAC-SHA256 celého tajného klíče, hex (sedí na CHECK v migraci 072). */
export function hashSecret(key: string): string {
  return createHmac('sha256', pepper()).update(key).digest('hex')
}

export function generateSecretKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomToken(10)
  const key = `${SECRET_PREFIX}${prefix}_${randomToken(32)}`
  return { key, prefix, hash: hashSecret(key) }
}

/** Prefix z tajného klíče, nebo null, když klíč nemá správný tvar. */
export function secretPrefixOf(key: string): string | null {
  return SECRET_RE.exec(key)?.[1] ?? null
}

/** Porovná klíč s uloženým hashem v konstantním čase. */
export function secretMatches(key: string, storedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false
  const a = Buffer.from(hashSecret(key), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Začátek klíče k poznání, který je nastavený („sk_live_Ab12…“). Nikdy celý. */
export const maskSecret = (prefix: string): string => `${SECRET_PREFIX}${prefix.slice(0, 4)}…`

// --- Napojení v DB -----------------------------------------------------------

export type Integration = {
  id: string
  public_key: string
  secret_prefix: string | null
  allowed_origins: string[]
  last_used_at: Date | null
  created_at: Date
}

type Biz = Pick<WsBusiness, 'id'>

/**
 * Napojení byznysu (jedno na byznys). Když ještě není, založí ho s novým
 * veřejným klíčem — zámek na byznys zabrání dvěma souběžným založením.
 */
export async function ensureIntegration(ctx: WsContext, business: Biz): Promise<Integration> {
  const acc = ctx.accountId
  const [, , rows] = await wsDb(ctx).batch([
    q`SELECT pg_advisory_xact_lock(hashtext('integration:' || ${business.id}::text))`,
    q`
      INSERT INTO ws.web_integrations (account_id, business_id, public_key)
      SELECT ${acc}, ${business.id}, ${generatePublicKey()}
      WHERE NOT EXISTS (
        SELECT 1 FROM ws.web_integrations
        WHERE account_id = ${acc} AND business_id = ${business.id} AND active AND revoked_at IS NULL
      )
    `,
    q`
      SELECT id, public_key, secret_prefix, allowed_origins, last_used_at, created_at
      FROM ws.web_integrations
      WHERE account_id = ${acc} AND business_id = ${business.id} AND active AND revoked_at IS NULL
      ORDER BY created_at LIMIT 1
    `,
  ])
  return (rows as WsRow[])[0] as unknown as Integration
}

/**
 * Nový tajný klíč (i první). Starý přestane platit hned. Vrací klíč v čitelné
 * podobě — jediné místo, kde existuje; nikam se neukládá ani neloguje.
 */
export async function rotateSecretKey(ctx: WsContext, business: Biz): Promise<string> {
  const integration = await ensureIntegration(ctx, business)
  const { key, prefix, hash } = generateSecretKey()
  await wsDb(ctx)`
    UPDATE ws.web_integrations SET secret_prefix = ${prefix}, secret_hash = ${hash}
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${integration.id}
  `
  return key
}

/** Nový veřejný klíč (widget je pak potřeba vložit znovu). */
export async function rotatePublicKey(ctx: WsContext, business: Biz): Promise<string> {
  const integration = await ensureIntegration(ctx, business)
  const key = generatePublicKey()
  await wsDb(ctx)`
    UPDATE ws.web_integrations SET public_key = ${key}
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${integration.id}
  `
  return key
}

/** Uloží povolené domény (už normalizované, `normalizeOrigins`). */
export async function setAllowedOrigins(ctx: WsContext, business: Biz, origins: string[]): Promise<void> {
  const integration = await ensureIntegration(ctx, business)
  await wsDb(ctx)`
    UPDATE ws.web_integrations SET allowed_origins = ${origins}::text[]
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${integration.id}
  `
}

// --- Ověření z veřejného požadavku ------------------------------------------

export type ResolvedKey = {
  accountId: string
  businessId: string
  integrationId: string
  allowedOrigins: string[]
}

/** Veřejný klíč → napojení. Neznámý nebo zrušený = null. */
export async function resolvePublicKey(key: string): Promise<ResolvedKey | null> {
  if (!PUBLIC_KEY_RE.test(key)) return null
  const [row] = await wsSystem`SELECT * FROM ws.integration_by_public_key(${key})`
  if (!row) return null
  return {
    accountId: String(row.account_id),
    businessId: String(row.business_id),
    integrationId: String(row.integration_id),
    allowedOrigins: (row.allowed_origins as string[] | null) ?? [],
  }
}

/** Tajný klíč → napojení. Špatný tvar, neznámý prefix i neshoda hashe = null. */
export async function resolveSecretKey(key: string): Promise<ResolvedKey | null> {
  const prefix = secretPrefixOf(key)
  if (!prefix) return null
  const [row] = await wsSystem`SELECT * FROM ws.integration_by_secret_prefix(${prefix})`
  if (!row || !secretMatches(key, String(row.secret_hash))) return null
  return {
    accountId: String(row.account_id),
    businessId: String(row.business_id),
    integrationId: String(row.integration_id),
    allowedOrigins: [],
  }
}
