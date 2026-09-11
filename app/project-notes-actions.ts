'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { ProjectNote } from '@/lib/types'

export async function getProjectNotes(projectId: string): Promise<ProjectNote[]> {
  await requireAuth()
  return (await sql`
    SELECT * FROM project_notes WHERE project_id = ${projectId} ORDER BY created_at DESC
  `) as unknown as ProjectNote[]
}

export async function addProjectNote(projectId: string, section: string, content: string) {
  await requireAuth()
  const trimmedSection = section.trim()
  const trimmedContent = content.trim()
  if (!trimmedSection) throw new Error('Název sekce nemůže být prázdný.')
  if (!trimmedContent) throw new Error('Poznámka nemůže být prázdná.')

  const rows = await sql`
    INSERT INTO project_notes (project_id, section, content)
    VALUES (${projectId}, ${trimmedSection}, ${trimmedContent})
    RETURNING id, created_at
  `
  revalidatePath(`/dashboard/${projectId}`)
  return rows[0] as { id: string; created_at: string }
}

export async function deleteProjectNote(id: string, projectId: string) {
  await requireAuth()
  await sql`DELETE FROM project_notes WHERE id = ${id}`
  revalidatePath(`/dashboard/${projectId}`)
}
