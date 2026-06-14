'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import type { ProjectStatus } from '@/lib/types'

type ProjectPayload = {
  client_name: string
  description: string | null
  focus: string | null
  status: ProjectStatus
  progress: number
  price: number | null
  paid: boolean
  deadline: string | null
  notes: string | null
}

export async function createProject(payload: ProjectPayload) {
  await sql`
    INSERT INTO projects (client_name, description, focus, status, progress, price, paid, deadline, notes)
    VALUES (
      ${payload.client_name},
      ${payload.description},
      ${payload.focus},
      ${payload.status},
      ${payload.progress},
      ${payload.price},
      ${payload.paid},
      ${payload.deadline},
      ${payload.notes}
    )
  `
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function updateProject(
  id: string,
  payload: ProjectPayload,
  progressUpdate?: { from: number; description: string }
) {
  await sql`
    UPDATE projects SET
      client_name = ${payload.client_name},
      description = ${payload.description},
      focus = ${payload.focus},
      status = ${payload.status},
      progress = ${payload.progress},
      price = ${payload.price},
      paid = ${payload.paid},
      deadline = ${payload.deadline},
      notes = ${payload.notes},
      updated_at = now()
    WHERE id = ${id}
  `
  if (progressUpdate && progressUpdate.from !== payload.progress) {
    await sql`
      INSERT INTO progress_updates (project_id, progress_from, progress_to, description)
      VALUES (${id}, ${progressUpdate.from}, ${payload.progress}, ${progressUpdate.description})
    `
  }
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${id}`)
}

export async function deleteProject(id: string) {
  await sql`DELETE FROM projects WHERE id = ${id}`
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function addClientMessage(projectId: string, publicToken: string, content: string) {
  if (!content.trim()) return
  await sql`INSERT INTO client_messages (project_id, content) VALUES (${projectId}, ${content.trim()})`
  revalidatePath(`/dashboard/${projectId}`)
  revalidatePath(`/p/${publicToken}`)
}

export async function deleteClientMessage(messageId: string, projectId: string, publicToken: string) {
  await sql`DELETE FROM client_messages WHERE id = ${messageId} AND project_id = ${projectId}`
  revalidatePath(`/dashboard/${projectId}`)
  revalidatePath(`/p/${publicToken}`)
}
