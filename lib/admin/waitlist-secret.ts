import 'server-only'
import { sql } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/admin/google/crypto'

/**
 * Připojení k databázi waitlistu startupového projektu (audit 2026-11-24, #10).
 *
 * Je to connection string cizí databáze s e-maily lidí, tedy heslo. Dřív ležel
 * v `startup_projects.waitlist_db_url` nešifrovaný a server actions ho vracely
 * do prohlížeče. Teď se ukládá šifrovaně stejně jako obnovovací token Googlu
 * (`lib/admin/google/crypto.ts`, klíč `GOOGLE_TOKEN_KEY`), dešifruje se jen
 * na serveru a do prohlížeče jde nanejvýš `has_waitlist_db`.
 *
 * Starý nešifrovaný zápis se dál přečte a při dalším uložení projektu se
 * zašifruje.
 */

const SEALED = /^v1\./
const CONNECTION = /^postgres(?:ql)?:\/\/\S+$/i

export type WaitlistDbInput = { action: 'keep' } | { action: 'clear' } | { action: 'set'; url: string }

/** Ověří nové připojení: jen `postgres://` nebo `postgresql://`, bez mezer, rozumná délka. */
export function validWaitlistUrl(url: string): boolean {
  return url.length <= 1000 && CONNECTION.test(url)
}

export function isSealed(stored: string): boolean {
  return SEALED.test(stored)
}

export function sealWaitlistUrl(url: string): string {
  return encryptSecret(url)
}

/** Uložená hodnota → použitelné připojení (jen na serveru). Nečitelná hodnota = žádné. */
export function openWaitlistUrl(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!isSealed(stored)) return stored
  try {
    return decryptSecret(stored)
  } catch (err) {
    console.error('[waitlist] připojení k databázi nejde rozšifrovat:', (err as Error).name)
    return null
  }
}

export async function loadWaitlistDbUrl(projectId: string): Promise<string | null> {
  const rows = (await sql`SELECT waitlist_db_url FROM startup_projects WHERE id = ${projectId}`) as {
    waitlist_db_url: string | null
  }[]
  return openWaitlistUrl(rows[0]?.waitlist_db_url)
}

/**
 * Co se má zapsat do `waitlist_db_url` při uložení projektu. `undefined` =
 * nesahat. Nešifrovaný starý zápis se při „ponechat" zašifruje.
 */
export async function nextStoredWaitlistUrl(projectId: string, input: WaitlistDbInput): Promise<string | null | undefined> {
  if (input.action === 'clear') return null
  if (input.action === 'set') return sealWaitlistUrl(input.url)
  const rows = (await sql`SELECT waitlist_db_url FROM startup_projects WHERE id = ${projectId}`) as {
    waitlist_db_url: string | null
  }[]
  const current = rows[0]?.waitlist_db_url
  return current && !isSealed(current) ? sealWaitlistUrl(current) : undefined
}
