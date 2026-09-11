'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { BlockTemplate } from '@/lib/types'

export async function getBlockTemplates(): Promise<BlockTemplate[]> {
  await requireAuth()
  return (await sql`
    SELECT * FROM block_templates ORDER BY position ASC, created_at ASC
  `) as unknown as BlockTemplate[]
}

export async function createBlockTemplate(name: string, description: string, color: string) {
  await requireAuth()
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Název šablony nemůže být prázdný.')

  const maxPositionRows = await sql`SELECT COALESCE(MAX(position), -1) AS max FROM block_templates`
  const nextPosition = (maxPositionRows[0] as { max: number }).max + 1

  const rows = await sql`
    INSERT INTO block_templates (name, description, color, position)
    VALUES (${trimmedName}, ${description.trim() || null}, ${color || null}, ${nextPosition})
    RETURNING *
  `
  revalidatePath('/dashboard/sablony')
  return rows[0] as BlockTemplate
}

export async function updateBlockTemplate(
  id: string,
  data: { name?: string; description?: string; color?: string }
) {
  await requireAuth()
  const current = await sql`SELECT * FROM block_templates WHERE id = ${id} LIMIT 1`
  if (!current.length) throw new Error('Šablona nenalezena.')
  const existing = current[0] as BlockTemplate

  const name = data.name !== undefined ? data.name.trim() : existing.name
  if (!name) throw new Error('Název šablony nemůže být prázdný.')
  const description = data.description !== undefined ? (data.description.trim() || null) : existing.description
  const color = data.color !== undefined ? (data.color || null) : existing.color

  await sql`
    UPDATE block_templates
    SET name = ${name}, description = ${description}, color = ${color}, updated_at = now()
    WHERE id = ${id}
  `
  revalidatePath('/dashboard/sablony')
}

export async function deleteBlockTemplate(id: string) {
  await requireAuth()
  await sql`DELETE FROM block_templates WHERE id = ${id}`
  revalidatePath('/dashboard/sablony')
}
