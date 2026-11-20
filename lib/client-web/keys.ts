import 'server-only'
import { timingSafeEqual } from 'crypto'
import { sql } from '@/lib/db'
import { adminDb } from '@/lib/admin/db'
import { hashAgentKey, randomToken } from '@/lib/agent-keys'
import { buildWebLeadStats, type WebEventKind, type WebLeadStats } from '@/lib/client-web/stats'

// Klíč webu zakázky (KP17, migrace 126, R-129).
//
// Klíč `zk_web_<prefix>_<tajemství>` umí jen zapsat událost „poptávka" nebo
// „objednávka" k jedné zakázce. Nic nečte. Ukáže se jednou při vytvoření;
// v DB je jen prefix a HMAC-SHA256 celého klíče s pepřem AGENT_KEY_PEPPER
// (stejný jako u klíčů pro Claude Code — oba typy leží v projektu klienta;
// jiný tvar klíče hashe od sebe odděluje). Bez pepře klíč nejde vytvořit ani
// ověřit. Leží jen v env serveru webu klienta, nikdy v JavaScriptu stránky.
//
// Pozor: tohle NENÍ `lib/web-leads.ts` (Kryštofova schránka Poptávky).

const KEY_PREFIX = 'zk_web_'
const KEY_RE = /^zk_web_([A-Za-z0-9]{10})_([A-Za-z0-9]{32})$/

export function generateWebKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomToken(10)
  const key = `${KEY_PREFIX}${prefix}_${randomToken(32)}`
  return { key, prefix, hash: hashAgentKey(key) }
}

export const webKeyPrefixOf = (key: string): string | null => KEY_RE.exec(key)?.[1] ?? null

export function webKeyMatches(key: string, storedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(storedHash)) return false
  const a = Buffer.from(hashAgentKey(key), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Začátek klíče k poznání, který je nastavený. Nikdy celý. */
export const maskWebKey = (prefix: string): string => `${KEY_PREFIX}${prefix.slice(0, 4)}…`

function missing(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42883' || code === '42703'
}

const iso = (value: Date | string | null | undefined): string | null => (value ? new Date(value).toISOString() : null)

// --- Klíč --------------------------------------------------------------------

/** Nový klíč; platný dosavadní se zneplatní. Klíč v čitelné podobě existuje jen tady. */
export async function issueWebKey(projectId: string, by: string): Promise<string> {
  const { key, prefix, hash } = generateWebKey()
  await sql`
    UPDATE project_web_keys SET revoked_at = now(), revoked_by = ${by}
    WHERE project_id = ${projectId} AND revoked_at IS NULL
  `
  await sql`
    INSERT INTO project_web_keys (project_id, prefix, key_hash, created_by)
    VALUES (${projectId}, ${prefix}, ${hash}, ${by})
  `
  return key
}

export async function revokeWebKey(projectId: string, by: string): Promise<boolean> {
  const rows = await sql`
    UPDATE project_web_keys SET revoked_at = now(), revoked_by = ${by}
    WHERE project_id = ${projectId} AND revoked_at IS NULL
    RETURNING id
  `
  return rows.length > 0
}

export type ResolvedWebKey = { keyId: string; projectId: string }

/** Klíč → zakázka. Špatný tvar, neznámý prefix, neshoda i zneplatněný klíč = null. */
export async function resolveWebKey(key: string): Promise<ResolvedWebKey | null> {
  const prefix = webKeyPrefixOf(key)
  if (!prefix) return null
  const rows = await sql`
    SELECT id::text, project_id::text, key_hash, revoked_at FROM project_web_keys WHERE prefix = ${prefix} LIMIT 1
  `
  const row = rows[0] as { id: string; project_id: string; key_hash: string; revoked_at: Date | string | null } | undefined
  if (!row || !webKeyMatches(key, row.key_hash) || row.revoked_at) return null
  return { keyId: row.id, projectId: row.project_id }
}

/** Zapíše událost a čas použití klíče. Jen druh, čas a zakázka — nic o lidech. */
export async function recordWebEvent(resolved: ResolvedWebKey, kind: WebEventKind, isTest: boolean): Promise<void> {
  await sql`
    INSERT INTO project_web_events (project_id, key_id, kind, is_test)
    VALUES (${resolved.projectId}, ${resolved.keyId}, ${kind}, ${isTest})
  `
  try {
    await sql`UPDATE project_web_keys SET last_used_at = now() WHERE id = ${resolved.keyId}`
  } catch (err) {
    console.error('[web-udalost] last_used_at se nezapsal:', err instanceof Error ? err.name : 'unknown')
  }
}

// --- Admin -------------------------------------------------------------------

export type WebKeyInfo = { prefixMask: string; createdAt: string; lastUsedAt: string | null }

export type ProjectWebLeads = {
  key: WebKeyInfo | null
  stats: WebLeadStats
  /** Poslední skutečná (nezkušební) událost. */
  lastEventAt: string | null
  /** Poslední zkušební událost — potvrzuje, že napojení funguje. */
  lastTestAt: string | null
}

/** Karta v detailu zakázky. `null` = migrace 126 ještě neběžela. */
export async function loadProjectWebLeads(projectId: string): Promise<ProjectWebLeads | null> {
  try {
    // Jedno kolo do databáze (R-092): klíč, měsíce a poslední události.
    const [keys, months, last] = await adminDb.batch([
      {
        text: `SELECT prefix, created_at, last_used_at FROM project_web_keys
               WHERE project_id = $1 AND revoked_at IS NULL LIMIT 1`,
        params: [projectId],
      },
      {
        text: `SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'Europe/Prague'), 'YYYY-MM') AS month,
                      count(*) FILTER (WHERE kind = 'poptavka')::int AS poptavky,
                      count(*) FILTER (WHERE kind = 'objednavka')::int AS objednavky
               FROM project_web_events
               WHERE project_id = $1 AND NOT is_test
                 AND created_at >= ((date_trunc('month', now() AT TIME ZONE 'Europe/Prague') - interval '11 months') AT TIME ZONE 'Europe/Prague')
               GROUP BY 1`,
        params: [projectId],
      },
      {
        text: `SELECT max(created_at) FILTER (WHERE NOT is_test) AS last_event,
                      max(created_at) FILTER (WHERE is_test) AS last_test
               FROM project_web_events WHERE project_id = $1`,
        params: [projectId],
      },
    ])
    const k = keys[0] as { prefix: string; created_at: Date | string; last_used_at: Date | string | null } | undefined
    const l = last[0] as { last_event: Date | string | null; last_test: Date | string | null } | undefined
    return {
      key: k ? { prefixMask: maskWebKey(k.prefix), createdAt: iso(k.created_at) ?? '', lastUsedAt: iso(k.last_used_at) } : null,
      stats: buildWebLeadStats(months as { month: unknown; poptavky: unknown; objednavky: unknown }[]),
      lastEventAt: iso(l?.last_event),
      lastTestAt: iso(l?.last_test),
    }
  } catch (err) {
    if (missing(err)) return null
    throw err
  }
}
