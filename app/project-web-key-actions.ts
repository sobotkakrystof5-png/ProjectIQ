'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdminSession, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { projectPath } from '@/lib/lead-origins'
import { AgentKeyConfigError } from '@/lib/agent-keys'
import { issueWebKey, revokeWebKey } from '@/lib/client-web/keys'

// Klíč webu zakázky pro počítání poptávek (KP17, R-129). Klíč se vrací jen
// z vytvoření a nikam se neloguje. Klientský prostor se přepočítá sám —
// čte čísla přímo z událostí.

const idSchema = z.string().uuid()

async function actor(): Promise<string> {
  const session = await getAdminSession()
  return session?.email ?? 'admin'
}

function revalidate(projectId: string): void {
  revalidatePath(projectPath(projectId))
}

/** Vytvoří klíč, nebo ho otočí (dosavadní přestane platit). */
export async function createOrRotateWebKey(
  projectId: string,
): Promise<{ success: true; key: string } | { success: false; error: string }> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  if (!id.success) return { success: false, error: 'Neplatná zakázka.' }
  const exists = await sql`SELECT 1 FROM projects WHERE id = ${id.data} LIMIT 1`
  if (!exists.length) return { success: false, error: 'Zakázka nebyla nalezena.' }
  try {
    const key = await issueWebKey(id.data, await actor())
    revalidate(id.data)
    return { success: true, key }
  } catch (err) {
    if (err instanceof AgentKeyConfigError) {
      return { success: false, error: 'Chybí nastavení AGENT_KEY_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
    }
    console.error('[web-udalost] vytvoření klíče selhalo:', err instanceof Error ? err.name : 'unknown')
    return { success: false, error: 'Klíč se nepodařilo vytvořit. Zkuste to prosím znovu.' }
  }
}

export async function revokeProjectWebKey(projectId: string): Promise<{ success: boolean; error?: string }> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  if (!id.success) return { success: false, error: 'Neplatná zakázka.' }
  const done = await revokeWebKey(id.data, await actor())
  revalidate(id.data)
  return done ? { success: true } : { success: false, error: 'Klíč už není platný.' }
}
