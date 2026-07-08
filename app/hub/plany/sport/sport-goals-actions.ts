'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type HealthGoalStatus = 'aktivni' | 'splneno' | 'pozastaveno'

export interface HealthGoal {
  id: string
  title: string
  description: string | null
  target_value: number | null
  current_value: number | null
  unit: string | null
  status: HealthGoalStatus
  target_date: string | null
  created_at: string
  updated_at: string | null
}

export interface HealthGoalAction {
  id: string
  goal_id: string
  content: string
  position: number
  done: boolean
  created_at: string
}

export interface HealthGoalLog {
  id: string
  goal_id: string
  log_date: string
  value: number
  note: string | null
  created_at: string
}

export interface HealthGoalPayload {
  title: string
  description?: string
  target_value?: number | null
  current_value?: number | null
  unit?: string
  status: HealthGoalStatus
  target_date?: string | null
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getHealthGoals(): Promise<HealthGoal[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, title, description, target_value::float, current_value::float, unit,
      status, target_date::text, created_at::text, updated_at::text
    FROM plan_health_goals
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as HealthGoal[]
}

export async function getHealthGoalActions(goalId: string): Promise<HealthGoalAction[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, goal_id::text, content, position, done, created_at::text
    FROM plan_health_goal_actions
    WHERE goal_id = ${goalId}
    ORDER BY position ASC
  `
  return rows as HealthGoalAction[]
}

export async function createHealthGoal(data: HealthGoalPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    const rows = await sql`
      INSERT INTO plan_health_goals (title, description, target_value, current_value, unit, status, target_date)
      VALUES (
        ${data.title.trim()},
        ${data.description?.trim() || null},
        ${data.target_value ?? null},
        ${data.current_value ?? null},
        ${data.unit?.trim() || null},
        ${data.status},
        ${data.target_date || null}
      )
      RETURNING id::text AS id
    `
    revalidatePath('/hub/plany/sport')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit cíl' }
  }
}

export async function updateHealthGoal(id: string, data: HealthGoalPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    await sql`
      UPDATE plan_health_goals SET
        title = ${data.title.trim()},
        description = ${data.description?.trim() || null},
        target_value = ${data.target_value ?? null},
        current_value = ${data.current_value ?? null},
        unit = ${data.unit?.trim() || null},
        status = ${data.status},
        target_date = ${data.target_date || null},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath('/hub/plany/sport')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit cíl' }
  }
}

export async function deleteHealthGoal(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE plan_health_goals SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/plany/sport')
  revalidatePath('/hub/plany')
  revalidatePath('/hub')
}

export async function setGoalActions(
  goalId: string,
  actions: { content: string; done: boolean }[]
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const cleaned = actions.filter((a) => a.content?.trim()).slice(0, 5)

    await sql`DELETE FROM plan_health_goal_actions WHERE goal_id = ${goalId}`
    for (let i = 0; i < cleaned.length; i++) {
      await sql`
        INSERT INTO plan_health_goal_actions (goal_id, content, position, done)
        VALUES (${goalId}, ${cleaned[i].content.trim()}, ${i + 1}, ${cleaned[i].done})
      `
    }
    revalidatePath('/hub/plany/sport')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit kroky' }
  }
}

export async function addHealthGoalLog(
  goalId: string,
  data: { value: number; note?: string; log_date?: string }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (data.value === undefined || data.value === null || Number.isNaN(data.value)) {
      return { error: 'Hodnota je povinná' }
    }

    await sql`
      INSERT INTO plan_health_goal_logs (goal_id, log_date, value, note)
      VALUES (${goalId}, ${data.log_date || new Date().toISOString().slice(0, 10)}, ${data.value}, ${data.note?.trim() || null})
    `
    await sql`UPDATE plan_health_goals SET current_value = ${data.value}, updated_at = now() WHERE id = ${goalId}`

    revalidatePath('/hub/plany/sport')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit záznam' }
  }
}

export async function getHealthGoalLogs(goalId: string): Promise<HealthGoalLog[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, goal_id::text, log_date::text, value::float, note, created_at::text
    FROM plan_health_goal_logs
    WHERE goal_id = ${goalId}
    ORDER BY log_date ASC
  `
  return rows as HealthGoalLog[]
}

export async function deleteHealthGoalLog(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM plan_health_goal_logs WHERE id = ${id}`
  revalidatePath('/hub/plany/sport')
}
