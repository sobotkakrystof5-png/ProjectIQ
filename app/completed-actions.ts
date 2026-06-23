'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { ProjectType, CostType, CostCategory } from '@/lib/types'

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
  deposit_amount: number | null
  difficulty: number
  time_invested: number | null
  notes: string | null
  project_type: ProjectType
}

export type CostPayload = {
  name: string
  amount: number
  cost_type: CostType
  category: CostCategory
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

export async function getProjectSurveys() {
  const session = await getServerSession(authOptions)
  if (!session) return []
  return await sql`SELECT * FROM project_surveys ORDER BY created_at DESC`
}

export async function deleteProjectSurvey(id: string) {
  await requireAuth()
  await sql`DELETE FROM project_surveys WHERE id = ${id}`
  revalidatePath('/dashboard/hodnoceni')
}

export async function createCompletedProject(payload: CompletedProjectPayload) {
  await requireAuth()
  const rows = await sql`
    INSERT INTO completed_projects (title, client_name, company, completed_at, amount, deposit_amount, difficulty, time_invested, notes, project_type)
    VALUES (
      ${payload.title},
      ${payload.client_name},
      ${payload.company},
      ${payload.completed_at},
      ${payload.amount},
      ${payload.deposit_amount},
      ${payload.difficulty},
      ${payload.time_invested},
      ${payload.notes},
      ${payload.project_type}
    )
    RETURNING id
  `
  const newId = (rows[0] as { id: string }).id
  if (payload.amount > 0) {
    const note = payload.title + (payload.client_name ? ' — ' + payload.client_name : '')
    await sql`
      INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_completed_project_id)
      VALUES (${payload.amount}, 'income', 'dokončený projekt', ${note}, ${payload.completed_at}, NULL, ${newId})
    `
  }
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
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
      deposit_amount = ${payload.deposit_amount},
      difficulty = ${payload.difficulty},
      time_invested = ${payload.time_invested},
      notes = ${payload.notes},
      project_type = ${payload.project_type}
    WHERE id = ${id}
  `
  // Sync linked finance transaction
  if (payload.amount > 0) {
    const note = payload.title + (payload.client_name ? ' — ' + payload.client_name : '')
    await sql`
      UPDATE finance_transactions
      SET amount = ${payload.amount}, note = ${note}, date = ${payload.completed_at}
      WHERE source_completed_project_id = ${id}
    `
  } else {
    await sql`DELETE FROM finance_transactions WHERE source_completed_project_id = ${id}`
  }
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
}

export async function deleteCompletedProject(id: string) {
  await requireAuth()
  await sql`DELETE FROM completed_projects WHERE id = ${id}`
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
}

export async function createCost(payload: CostPayload) {
  await requireAuth()
  const rows = await sql`
    INSERT INTO costs (name, amount, cost_type, category, description)
    VALUES (${payload.name}, ${payload.amount}, ${payload.cost_type}, ${payload.category}, ${payload.description})
    RETURNING id
  `
  // Jednorázové náklady → okamžitě do financí
  if (payload.cost_type === 'one_time' && payload.amount > 0) {
    const newId = (rows[0] as { id: string }).id
    await sql`
      INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
      VALUES (${payload.amount}, 'expense', 'náklady', ${payload.name}, now()::date, NULL, ${newId})
    `
  }
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
}

export async function updateCost(id: string, payload: CostPayload) {
  await requireAuth()
  await sql`
    UPDATE costs SET
      name = ${payload.name},
      amount = ${payload.amount},
      cost_type = ${payload.cost_type},
      category = ${payload.category},
      description = ${payload.description}
    WHERE id = ${id}
  `
  // Sync linked finance transaction (platí jen pro one_time)
  if (payload.cost_type === 'one_time' && payload.amount > 0) {
    await sql`
      UPDATE finance_transactions
      SET amount = ${payload.amount}, note = ${payload.name}
      WHERE source_cost_id = ${id}
    `
  } else {
    await sql`DELETE FROM finance_transactions WHERE source_cost_id = ${id}`
  }
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
}

export async function deleteCost(id: string) {
  await requireAuth()
  await sql`DELETE FROM costs WHERE id = ${id}`
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
}
