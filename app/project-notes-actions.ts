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

export async function addProjectNote(projectId: string, author: string, content: string) {
  await requireAuth()
  const trimmedAuthor = author.trim()
  const trimmedContent = content.trim()
  if (!trimmedAuthor) throw new Error('Jméno autora nemůže být prázdné.')
  if (!trimmedContent) throw new Error('Poznámka nemůže být prázdná.')

  const rows = await sql`
    INSERT INTO project_notes (project_id, author, content, progress_snapshot)
    SELECT ${projectId}, ${trimmedAuthor}, ${trimmedContent}, progress FROM projects WHERE id = ${projectId}
    RETURNING id, created_at, progress_snapshot
  `
  if (!rows.length) throw new Error('Zakázka nebyla nalezena.')
  revalidatePath(`/dashboard/${projectId}`)
  return rows[0] as { id: string; created_at: string; progress_snapshot: number | null }
}

export async function deleteProjectNote(id: string, projectId: string) {
  await requireAuth()
  await sql`DELETE FROM project_notes WHERE id = ${id}`
  revalidatePath(`/dashboard/${projectId}`)
}
