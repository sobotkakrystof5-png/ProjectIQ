'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions, requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { projectPath, toBusiness } from '@/lib/business'
import { AgentKeyConfigError, issueAgentKey, revokeAgentKey } from '@/lib/agent-keys'

// Správa klíče projektu pro hlášení z Claude Code (KP04). Klíč se vrací jen
// z vytvoření a nikam se neloguje.

const idSchema = z.string().uuid()

async function adminEmail(): Promise<string> {
  const session = await getServerSession(authOptions)
  return session?.user?.email ?? 'admin'
}

async function revalidateProject(projectId: string): Promise<void> {
  const rows = await sql`SELECT business FROM projects WHERE id = ${projectId} LIMIT 1`
  const row = rows[0] as { business: string } | undefined
  if (row) revalidatePath(projectPath(toBusiness(row.business), projectId))
}

/** Vytvoří klíč, nebo ho otočí (dosavadní přestane platit). */
export async function createOrRotateAgentKey(
  projectId: string,
): Promise<{ success: true; key: string } | { success: false; error: string }> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  if (!id.success) return { success: false, error: 'Neplatná zakázka.' }
  const exists = await sql`SELECT 1 FROM projects WHERE id = ${id.data} LIMIT 1`
  if (!exists.length) return { success: false, error: 'Zakázka nebyla nalezena.' }
  try {
    const key = await issueAgentKey(id.data, await adminEmail())
    await revalidateProject(id.data)
    return { success: true, key }
  } catch (err) {
    if (err instanceof AgentKeyConfigError) {
      return { success: false, error: 'Chybí nastavení AGENT_KEY_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
    }
    console.error('[agent-keys] vytvoření klíče selhalo:', err instanceof Error ? err.name : 'unknown')
    return { success: false, error: 'Klíč se nepodařilo vytvořit. Zkuste to prosím znovu.' }
  }
}

export async function revokeProjectAgentKey(projectId: string): Promise<{ success: boolean; error?: string }> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  if (!id.success) return { success: false, error: 'Neplatná zakázka.' }
  const done = await revokeAgentKey(id.data, await adminEmail())
  await revalidateProject(id.data)
  return done ? { success: true } : { success: false, error: 'Klíč už není platný.' }
}
