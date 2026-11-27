import 'server-only'

import { sql } from '@/lib/db'
import { isAdminEmail } from './config'

/**
 * Úklid přístupů v Supabase Auth po zrušení účtu Workspace (R-154, GDPR).
 *
 * Jeden účet v Supabase slouží pro Workspace i klientský prostor (R-107), takže
 * se smaže jen tehdy, když ho člověk už nikde nepotřebuje: není členem jiného
 * účtu Workspace, není aktivním členem klientského prostoru a není to admin.
 * Volá se REST API klíčem `SUPABASE_SERVICE_ROLE_KEY` jen ze serveru (cron),
 * prohlížeč na Supabase nesahá. Bez klíče se nic nemaže a vrací se `skipped`.
 */

const url = () => (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AuthUserCleanup = 'deleted' | 'kept' | 'skipped'

/** Je id pořád někde potřeba? Čte vlastník tabulek (ws i portal). */
async function stillUsed(userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT EXISTS (SELECT 1 FROM ws.members WHERE clerk_user_id = ${userId})
        OR EXISTS (SELECT 1 FROM portal.members WHERE clerk_user_id = ${userId} AND removed_at IS NULL) AS used
  `
  return Boolean((rows[0] as { used?: boolean } | undefined)?.used)
}

export async function deleteAuthUserIfUnused(userId: string, fetchImpl: typeof fetch = fetch): Promise<AuthUserCleanup> {
  // Id z doby Clerku (user_…) v Supabase neexistuje.
  if (!UUID_RE.test(userId)) return 'skipped'
  if (!url().startsWith('https://') || !key()) return 'skipped'
  const pinned = (process.env.ADMIN_USER_ID ?? '').trim().toLowerCase()
  if (pinned && pinned === userId.toLowerCase()) return 'kept'
  if (await stillUsed(userId)) return 'kept'

  const endpoint = `${url()}/auth/v1/admin/users/${encodeURIComponent(userId)}`
  const headers = { apikey: key(), Authorization: `Bearer ${key()}` }

  // Účet adminu se nikdy nemaže, ani když by byl omylem členem Workspace a id
  // adminu nebylo připnuté v ADMIN_USER_ID — proto se e-mail ověří u Supabase.
  const current = await fetchImpl(endpoint, { headers })
  if (current.status === 404) return 'deleted'
  if (!current.ok) throw new Error(`supabase-admin:${current.status}`)
  const user = (await current.json().catch(() => null)) as { email?: unknown } | null
  if (typeof user?.email === 'string' && isAdminEmail(user.email)) return 'kept'

  const res = await fetchImpl(endpoint, { method: 'DELETE', headers })
  if (res.ok || res.status === 404) return 'deleted'
  throw new Error(`supabase-admin:${res.status}`)
}
