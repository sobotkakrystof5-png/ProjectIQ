import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { sql } from '@/lib/db'

// Klíče projektů pro hlášení z Claude Code (KP04, migrace 094).
//
// Klíč `zk_agent_<prefix>_<tajemství>` umí jen zapsat koncept hlášení do jednoho
// projektu. Ukáže se jednou při vytvoření; v DB je jen prefix pro vyhledání
// a HMAC-SHA256 celého klíče s pepřem AGENT_KEY_PEPPER (samostatný od
// WS_KEY_PEPPER, aby únik jednoho nepodepsal druhý). Porovnání v konstantním
// čase. Bez pepře klíč nejde vytvořit ani ověřit (selže zavřeně).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const KEY_PREFIX = 'zk_agent_'
const KEY_RE = /^zk_agent_([A-Za-z0-9]{10})_([A-Za-z0-9]{32})$/

/** Náhodný řetězec z písmen a číslic bez zkreslení (zamítá bajty nad 247). */
function randomToken(length: number): string {
  let out = ''
  while (out.length < length) {
    const bytes = randomBytes(length * 2)
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      if (bytes[i] < 248) out += ALPHABET[bytes[i] % 62]
    }
  }
  return out
}

export class AgentKeyConfigError extends Error {
  constructor() {
    super('Chybí AGENT_KEY_PEPPER (min. 32 znaků) — klíče projektů nejde vytvořit ani ověřit.')
  }
}

function pepper(): string {
  const value = process.env.AGENT_KEY_PEPPER ?? ''
  if (value.length < 32) throw new AgentKeyConfigError()
  return value
}

export const isAgentKeyConfigured = (): boolean => (process.env.AGENT_KEY_PEPPER ?? '').length >= 32

export function hashAgentKey(key: string): string {
  return createHmac('sha256', pepper()).update(key).digest('hex')
}

export function generateAgentKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomToken(10)
  const key = `${KEY_PREFIX}${prefix}_${randomToken(32)}`
  return { key, prefix, hash: hashAgentKey(key) }
}

/** Prefix z klíče, nebo null, když klíč nemá správný tvar. */
export const agentKeyPrefixOf = (key: string): string | null => KEY_RE.exec(key)?.[1] ?? null

/** Porovná klíč s uloženým hashem v konstantním čase. */
export function agentKeyMatches(key: string, storedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false
  const a = Buffer.from(hashAgentKey(key), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Začátek klíče k poznání, který je nastavený. Nikdy celý. */
export const maskAgentKey = (prefix: string): string => `${KEY_PREFIX}${prefix.slice(0, 4)}…`

/** Hlavička `Authorization: Bearer …` → klíč, nebo null. */
export function bearerFrom(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return match ? match[1] : null
}

// --- Databáze ----------------------------------------------------------------

export interface AgentKeyInfo {
  prefix: string
  createdAt: string
  createdBy: string | null
  lastUsedAt: string | null
}

const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null)

/** Platný klíč projektu (jen prefix a data, nikdy hash). Chybí tabulka = null. */
export async function getActiveAgentKey(projectId: string): Promise<AgentKeyInfo | null> {
  try {
    const rows = await sql`
      SELECT prefix, created_at, created_by, last_used_at
      FROM project_agent_keys
      WHERE project_id = ${projectId} AND revoked_at IS NULL
      LIMIT 1
    `
    const row = rows[0] as
      | { prefix: string; created_at: Date | string; created_by: string | null; last_used_at: Date | string | null }
      | undefined
    if (!row) return null
    return {
      prefix: row.prefix,
      createdAt: iso(row.created_at) ?? '',
      createdBy: row.created_by,
      lastUsedAt: iso(row.last_used_at),
    }
  } catch {
    return null
  }
}

/**
 * Nový klíč projektu; platný dosavadní se zneplatní (řádek zůstane jako záznam).
 * Vrací klíč v čitelné podobě — jediné místo, kde existuje; nikam se neukládá
 * ani neloguje.
 */
export async function issueAgentKey(projectId: string, by: string): Promise<string> {
  const { key, prefix, hash } = generateAgentKey()
  await sql`
    UPDATE project_agent_keys SET revoked_at = now(), revoked_by = ${by}
    WHERE project_id = ${projectId} AND revoked_at IS NULL
  `
  await sql`
    INSERT INTO project_agent_keys (project_id, prefix, key_hash, created_by)
    VALUES (${projectId}, ${prefix}, ${hash}, ${by})
  `
  return key
}

export async function revokeAgentKey(projectId: string, by: string): Promise<boolean> {
  const rows = await sql`
    UPDATE project_agent_keys SET revoked_at = now(), revoked_by = ${by}
    WHERE project_id = ${projectId} AND revoked_at IS NULL
    RETURNING id
  `
  return rows.length > 0
}

export interface ResolvedAgentKey {
  keyId: string
  projectId: string
}

/** Klíč → projekt. Špatný tvar, neznámý prefix, neshoda hashe i zneplatněný klíč = null. */
export async function resolveAgentKey(key: string): Promise<ResolvedAgentKey | null> {
  const prefix = agentKeyPrefixOf(key)
  if (!prefix) return null
  const rows = await sql`
    SELECT id, project_id, key_hash, revoked_at FROM project_agent_keys WHERE prefix = ${prefix} LIMIT 1
  `
  const row = rows[0] as { id: string; project_id: string; key_hash: string; revoked_at: Date | string | null } | undefined
  if (!row || !agentKeyMatches(key, row.key_hash) || row.revoked_at) return null
  return { keyId: row.id, projectId: row.project_id }
}

export async function touchAgentKey(keyId: string): Promise<void> {
  try {
    await sql`UPDATE project_agent_keys SET last_used_at = now() WHERE id = ${keyId}`
  } catch (err) {
    console.error('[agent-keys] last_used_at se nezapsal:', err instanceof Error ? err.name : 'unknown')
  }
}
