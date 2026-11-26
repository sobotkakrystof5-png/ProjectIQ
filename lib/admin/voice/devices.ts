import 'server-only'
import { adminDb, q } from '@/lib/admin/db'
import { generateVoiceKey, maskVoiceKey, voiceKeyMatches, voiceKeyPrefixOf } from '@/lib/admin/voice/keys'

/**
 * ZakazIQ Voice (R-150): zařízení s vlastním klíčem (migrace 138).
 *
 * Klíč v čitelné podobě existuje jen v návratové hodnotě `createDevice` —
 * nikam se neukládá ani neloguje. V DB je prefix a HMAC. Zneplatněné zařízení
 * zůstává jako záznam (diktáty na něj odkazují); „Zpět" v adminu ho smí vrátit
 * jen krátce po zneplatnění, aby zneplatnění po úniku klíče nešlo omylem
 * zrušit o hodinu později.
 */

/** Kolik zařízení může mít platný klíč najednou. Jeden uživatel, pár Maců. */
export const MAX_ACTIVE_DEVICES = 10

/** Jak dlouho po zneplatnění jde zařízení vrátit („Zpět" v toastu). */
export const RESTORE_WINDOW_SECONDS = 120

export interface VoiceDevice {
  id: string
  name: string
  /** Začátek klíče k poznání (`zk_voice_AbCd…`), nikdy celý. */
  keyMask: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type VoiceDevicesResult = { ok: true; devices: VoiceDevice[] } | { ok: false; reason: 'missing_tables' }

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null)

/** Tabulka nebo sloupec z migrace 138 ještě nejsou v databázi. */
export function isMissingVoiceSchema(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42703'
}

export type DeviceRow = {
  id: string
  name: string
  prefix: string
  created_at: unknown
  last_used_at: unknown
  revoked_at: unknown
}

export const toDevice = (r: DeviceRow): VoiceDevice => ({
  id: r.id,
  name: r.name,
  keyMask: maskVoiceKey(r.prefix),
  createdAt: iso(r.created_at) ?? '',
  lastUsedAt: iso(r.last_used_at),
  revokedAt: iso(r.revoked_at),
})

/** Seznam pro admin: platná nahoře, nejnovější první. Jako dotaz kvůli dávce stránky (VO10). */
export const DEVICES_SQL = q`
  SELECT id::text, name, prefix, created_at, last_used_at, revoked_at
  FROM voice_devices
  ORDER BY revoked_at IS NOT NULL, created_at DESC
  LIMIT 100
`

/** Seznam pro admin. Bez migrace 138 `missing_tables`. */
export async function listDevices(): Promise<VoiceDevicesResult> {
  try {
    const [rows] = await adminDb.batch([DEVICES_SQL])
    return { ok: true, devices: (rows as DeviceRow[]).map(toDevice) }
  } catch (err) {
    if (isMissingVoiceSchema(err)) return { ok: false, reason: 'missing_tables' }
    throw err
  }
}

export type CreateDeviceResult =
  | { ok: true; key: string; device: VoiceDevice }
  | { ok: false; reason: 'too_many' }

/**
 * Nové zařízení. Strop platných zařízení hlídá stejný příkaz, který vkládá,
 * takže ho neobejdou dvě kliknutí naráz. Pepř chybí → `VoiceKeyConfigError`.
 */
export async function createDevice(name: string, by: string): Promise<CreateDeviceResult> {
  const { key, prefix, hash } = generateVoiceKey()
  const rows = await adminDb<DeviceRow>`
    INSERT INTO voice_devices (name, prefix, key_hash, created_by)
    SELECT ${name}, ${prefix}, ${hash}, ${by}
    WHERE (SELECT count(*) FROM voice_devices WHERE revoked_at IS NULL) < ${MAX_ACTIVE_DEVICES}
    RETURNING id::text, name, prefix, created_at, last_used_at, revoked_at
  `
  const row = rows[0]
  if (!row) return { ok: false, reason: 'too_many' }
  return { ok: true, key, device: toDevice(row) }
}

export async function revokeDevice(id: string, by: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE voice_devices SET revoked_at = now(), revoked_by = ${by}
    WHERE id = ${id} AND revoked_at IS NULL
    RETURNING id
  `
  return rows.length > 0
}

/** „Zpět" po zneplatnění — jen do RESTORE_WINDOW_SECONDS a jen pod stropem zařízení. */
export async function restoreDevice(id: string): Promise<boolean> {
  const rows = await adminDb`
    UPDATE voice_devices SET revoked_at = NULL, revoked_by = NULL
    WHERE id = ${id}
      AND revoked_at IS NOT NULL
      AND revoked_at > now() - make_interval(secs => ${RESTORE_WINDOW_SECONDS})
      AND (SELECT count(*) FROM voice_devices WHERE revoked_at IS NULL) < ${MAX_ACTIVE_DEVICES}
    RETURNING id
  `
  return rows.length > 0
}

export type ResolvedVoiceDevice = { id: string; name: string }

/**
 * Klíč → zařízení. Špatný tvar, neznámý prefix, neshoda otisku i zneplatněné
 * zařízení vrátí stejně `null`, ať odpověď neprozradí, které z toho to bylo.
 */
export async function resolveDevice(key: string): Promise<ResolvedVoiceDevice | null> {
  const prefix = voiceKeyPrefixOf(key)
  if (!prefix) return null
  const rows = await adminDb<{ id: string; name: string; key_hash: string; revoked_at: unknown }>`
    SELECT id::text, name, key_hash, revoked_at FROM voice_devices WHERE prefix = ${prefix} LIMIT 1
  `
  const row = rows[0]
  if (!row || !voiceKeyMatches(key, row.key_hash) || row.revoked_at) return null
  return { id: row.id, name: row.name }
}

export async function touchDevice(id: string): Promise<void> {
  try {
    await adminDb`UPDATE voice_devices SET last_used_at = now() WHERE id = ${id}`
  } catch (err) {
    console.error('[voice] last_used_at se nezapsal:', err instanceof Error ? err.name : 'unknown')
  }
}
