'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { BlockTemplate, ProjectBlock } from '@/lib/types'

export async function getProjectBlocks(projectId: string): Promise<ProjectBlock[]> {
  await requireAuth()
  return (await sql`
    SELECT * FROM project_blocks WHERE project_id = ${projectId} ORDER BY position ASC
  `) as unknown as ProjectBlock[]
}

async function nextPosition(projectId: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(MAX(position), -1) AS max FROM project_blocks WHERE project_id = ${projectId}
  `
  return (rows[0] as { max: number }).max + 1
}

export async function addProjectBlockFromTemplate(projectId: string, templateId: string) {
  await requireAuth()
  const templateRows = await sql`SELECT * FROM block_templates WHERE id = ${templateId} LIMIT 1`
  if (!templateRows.length) throw new Error('Šablona nenalezena.')
  const template = templateRows[0] as BlockTemplate

  const position = await nextPosition(projectId)
  const rows = await sql`
    INSERT INTO project_blocks (project_id, source_template_id, title, color, position)
    VALUES (${projectId}, ${template.id}, ${template.name}, ${template.color}, ${position})
    RETURNING *
  `
  revalidatePath(`/dashboard/${projectId}/sablona`)
  return rows[0] as ProjectBlock
}

export async function addCustomProjectBlock(projectId: string, title: string, color: string) {
  await requireAuth()
  const trimmedTitle = title.trim()
  if (!trimmedTitle) throw new Error('Název bloku nemůže být prázdný.')

  const position = await nextPosition(projectId)
  const rows = await sql`
    INSERT INTO project_blocks (project_id, source_template_id, title, color, position)
    VALUES (${projectId}, NULL, ${trimmedTitle}, ${color || null}, ${position})
    RETURNING *
  `
  revalidatePath(`/dashboard/${projectId}/sablona`)
  return rows[0] as ProjectBlock
}

export async function updateProjectBlock(
  id: string,
  projectId: string,
  data: { title?: string; color?: string; content?: string }
) {
  await requireAuth()
  const current = await sql`SELECT * FROM project_blocks WHERE id = ${id} LIMIT 1`
  if (!current.length) throw new Error('Blok nenalezen.')
  const existing = current[0] as ProjectBlock

  const title = data.title !== undefined ? data.title.trim() : existing.title
  if (!title) throw new Error('Název bloku nemůže být prázdný.')
  const color = data.color !== undefined ? (data.color || null) : existing.color
  const content = data.content !== undefined ? (data.content.trim() || null) : existing.content

  await sql`
    UPDATE project_blocks
    SET title = ${title}, color = ${color}, content = ${content}, updated_at = now()
    WHERE id = ${id}
  `
  revalidatePath(`/dashboard/${projectId}/sablona`)
}

export async function reorderProjectBlocks(projectId: string, orderedIds: string[]) {
  await requireAuth()
  for (let i = 0; i < orderedIds.length; i++) {
    await sql`
      UPDATE project_blocks SET position = ${i}
      WHERE id = ${orderedIds[i]} AND project_id = ${projectId}
    `
  }
  revalidatePath(`/dashboard/${projectId}/sablona`)
}

export async function removeProjectBlock(id: string, projectId: string) {
  await requireAuth()
  await sql`DELETE FROM project_blocks WHERE id = ${id}`
  revalidatePath(`/dashboard/${projectId}/sablona`)
}
