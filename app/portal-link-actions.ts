'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { projectPath } from '@/lib/lead-origins'

// Výměna odkazu na portál `/p/[token]` (audit 2026-11-15). Odkaz platí, dokud
// existuje zakázka; když unikne (přeposlaný e-mail), jediná obrana je vyměnit ho.
// Starý přestane platit hned. „Zpět" vrátí starý jen tehdy, když mezitím nikdo
// odkaz nevyměnil znovu.

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

const uuid = z.string().uuid()

export async function regeneratePortalLink(projectId: string): Promise<Result<{ previous: string; current: string }>> {
  await requireAuth()
  const id = uuid.safeParse(projectId)
  if (!id.success) return { success: false, error: 'Zakázka nebyla nalezena.' }

  const rows = await sql`
    WITH old AS (SELECT public_token FROM projects WHERE id = ${id.data})
    UPDATE projects SET public_token = gen_random_uuid()
    WHERE id = ${id.data}
    RETURNING (SELECT public_token FROM old) AS previous, public_token AS current
  `
  const row = rows[0] as { previous: string; current: string } | undefined
  if (!row) return { success: false, error: 'Zakázka nebyla nalezena.' }

  revalidatePath(`/p/${row.previous}`)
  revalidatePath(projectPath(id.data))
  return { success: true, previous: String(row.previous), current: String(row.current) }
}

export async function restorePortalLink(projectId: string, previous: string, current: string): Promise<Result> {
  await requireAuth()
  const id = uuid.safeParse(projectId)
  const prev = uuid.safeParse(previous)
  const cur = uuid.safeParse(current)
  if (!id.success || !prev.success || !cur.success) return { success: false, error: 'Odkaz už vrátit nejde.' }

  const rows = await sql`
    UPDATE projects SET public_token = ${prev.data}
    WHERE id = ${id.data} AND public_token = ${cur.data}
    RETURNING id
  `
  if (!rows.length) return { success: false, error: 'Odkaz už vrátit nejde.' }
  revalidatePath(`/p/${cur.data}`)
  revalidatePath(projectPath(id.data))
  return { success: true }
}
