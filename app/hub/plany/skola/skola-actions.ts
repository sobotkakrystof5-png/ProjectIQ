'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type SchoolGoalStatus = 'aktivni' | 'splneno' | 'pozastaveno'

export interface SchoolGoal {
  id: string
  title: string
  vision: string | null
  approach: string | null
  status: SchoolGoalStatus
  target_date: string | null
  created_at: string
  updated_at: string | null
}

export interface SchoolGoalAction {
  id: string
  goal_id: string
  content: string
  position: number
  done: boolean
  created_at: string
}

export interface SchoolGoalPayload {
  title: string
  vision?: string
  approach?: string
  status: SchoolGoalStatus
  target_date?: string | null
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getSchoolGoals(): Promise<SchoolGoal[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, title, vision, approach, status, target_date::text,
      created_at::text, updated_at::text
    FROM plan_school_goals
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as SchoolGoal[]
}

export async function getSchoolGoalActions(goalId: string): Promise<SchoolGoalAction[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, goal_id::text, content, position, done, created_at::text
    FROM plan_school_goal_actions
    WHERE goal_id = ${goalId}
    ORDER BY position ASC
  `
  return rows as SchoolGoalAction[]
}

export async function createSchoolGoal(data: SchoolGoalPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    const rows = await sql`
      INSERT INTO plan_school_goals (title, vision, approach, status, target_date)
      VALUES (
        ${data.title.trim()},
        ${data.vision?.trim() || null},
        ${data.approach?.trim() || null},
        ${data.status},
        ${data.target_date || null}
      )
      RETURNING id::text AS id
    `
    revalidatePath('/hub/plany/skola')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit cíl' }
  }
}

export async function updateSchoolGoal(id: string, data: SchoolGoalPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    await sql`
      UPDATE plan_school_goals SET
        title = ${data.title.trim()},
        vision = ${data.vision?.trim() || null},
        approach = ${data.approach?.trim() || null},
        status = ${data.status},
        target_date = ${data.target_date || null},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath('/hub/plany/skola')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit cíl' }
  }
}

export async function deleteSchoolGoal(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE plan_school_goals SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/plany/skola')
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

    await sql`DELETE FROM plan_school_goal_actions WHERE goal_id = ${goalId}`
    for (let i = 0; i < cleaned.length; i++) {
      await sql`
        INSERT INTO plan_school_goal_actions (goal_id, content, position, done)
        VALUES (${goalId}, ${cleaned[i].content.trim()}, ${i + 1}, ${cleaned[i].done})
      `
    }
    revalidatePath('/hub/plany/skola')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit kroky' }
  }
}
