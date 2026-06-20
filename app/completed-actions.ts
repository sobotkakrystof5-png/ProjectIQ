'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { ProjectType, CostType } from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Neautorizovaný přístup')
}

export type CompletedProjectPayload = {
  title: string
  client_name: string | null
  company: string | null
  completed_at: string
  amount: number
  difficulty: number
  time_invested: number | null
  notes: string | null
  project_type: ProjectType
}

export type CostPayload = {
  name: string
  amount: number
  cost_type: CostType
  description: string | null
}

export async function getCompletedProjects() {
  const session = await getServerSession(authOptions)
  if (!session) return []
  return await sql`SELECT * FROM completed_projects ORDER BY completed_at DESC`
}

export async function getCosts() {
  const session = await getServerSession(authOptions)
  if (!session) return []
  return await sql`SELECT * FROM costs ORDER BY cost_type, created_at DESC`
}

export async function createCompletedProject(payload: CompletedProjectPayload) {
  await requireAuth()
  await sql`
    INSERT INTO completed_projects (title, client_name, company, completed_at, amount, difficulty, time_invested, notes, project_type)
    VALUES (
      ${payload.title},
      ${payload.client_name},
      ${payload.company},
      ${payload.completed_at},
      ${payload.amount},
      ${payload.difficulty},
      ${payload.time_invested},
      ${payload.notes},
      ${payload.project_type}
    )
  `
  revalidatePath('/dashboard/dokoncene')
}

export async function updateCompletedProject(id: string, payload: CompletedProjectPayload) {
  await requireAuth()
  await sql`
    UPDATE completed_projects SET
      title = ${payload.title},
      client_name = ${payload.client_name},
      company = ${payload.company},
      completed_at = ${payload.completed_at},
      amount = ${payload.amount},
      difficulty = ${payload.difficulty},
      time_invested = ${payload.time_invested},
      notes = ${payload.notes},
      project_type = ${payload.project_type}
    WHERE id = ${id}
  `
  revalidatePath('/dashboard/dokoncene')
}

export async function deleteCompletedProject(id: string) {
  await requireAuth()
  await sql`DELETE FROM completed_projects WHERE id = ${id}`
  revalidatePath('/dashboard/dokoncene')
}

export async function createCost(payload: CostPayload) {
  await requireAuth()
  await sql`
    INSERT INTO costs (name, amount, cost_type, description)
    VALUES (${payload.name}, ${payload.amount}, ${payload.cost_type}, ${payload.description})
  `
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
}

export async function updateCost(id: string, payload: CostPayload) {
  await requireAuth()
  await sql`
    UPDATE costs SET
      name = ${payload.name},
      amount = ${payload.amount},
      cost_type = ${payload.cost_type},
      description = ${payload.description}
    WHERE id = ${id}
  `
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
}

export async function deleteCost(id: string) {
  await requireAuth()
  await sql`DELETE FROM costs WHERE id = ${id}`
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
}
