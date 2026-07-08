'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type PlanProjectStatus = 'validace' | 'schvaleno' | 'zamitnuto' | 'prevedeno_do_byznysu'

export interface PlanProject {
  id: string
  title: string
  description: string | null
  purpose_meaning: string | null
  problem_solved: string | null
  willingness_to_pay: string | null
  potential_notes: string | null
  progress_notes: string | null
  sentiment_pct: number | null
  planned_investment: number | null
  expected_return: number | null
  currency: string
  status: PlanProjectStatus
  created_at: string
  updated_at: string | null
}

export interface PlanProjectAction {
  id: string
  project_id: string
  content: string
  position: number
  done: boolean
  created_at: string
}

export interface PlanProjectPayload {
  title: string
  description?: string
  purpose_meaning?: string
  problem_solved?: string
  willingness_to_pay?: string
  potential_notes?: string
  progress_notes?: string
  sentiment_pct?: number | null
  planned_investment?: number | null
  expected_return?: number | null
  currency?: string
  status: PlanProjectStatus
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getPlanProjects(): Promise<PlanProject[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, title, description, purpose_meaning, problem_solved, willingness_to_pay,
      potential_notes, progress_notes, sentiment_pct, planned_investment::float, expected_return::float,
      currency, status, created_at::text, updated_at::text
    FROM plan_projects
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as PlanProject[]
}

export async function getPlanProject(id: string): Promise<PlanProject | null> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, title, description, purpose_meaning, problem_solved, willingness_to_pay,
      potential_notes, progress_notes, sentiment_pct, planned_investment::float, expected_return::float,
      currency, status, created_at::text, updated_at::text
    FROM plan_projects
    WHERE id = ${id}
    LIMIT 1
  `
  return (rows[0] as PlanProject) ?? null
}

export async function getPlanProjectActions(projectId: string): Promise<PlanProjectAction[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, project_id::text, content, position, done, created_at::text
    FROM plan_project_actions
    WHERE project_id = ${projectId}
    ORDER BY position ASC
  `
  return rows as PlanProjectAction[]
}

export async function createPlanProject(data: PlanProjectPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    const rows = await sql`
      INSERT INTO plan_projects (
        title, description, purpose_meaning, problem_solved, willingness_to_pay,
        potential_notes, progress_notes, sentiment_pct, planned_investment, expected_return,
        currency, status
      )
      VALUES (
        ${data.title.trim()},
        ${data.description?.trim() || null},
        ${data.purpose_meaning?.trim() || null},
        ${data.problem_solved?.trim() || null},
        ${data.willingness_to_pay?.trim() || null},
        ${data.potential_notes?.trim() || null},
        ${data.progress_notes?.trim() || null},
        ${data.sentiment_pct ?? null},
        ${data.planned_investment ?? null},
        ${data.expected_return ?? null},
        ${data.currency || 'CZK'},
        ${data.status}
      )
      RETURNING id::text AS id
    `
    revalidatePath('/hub/plany/projekty')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit nápad' }
  }
}

export async function updatePlanProject(id: string, data: PlanProjectPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    await sql`
      UPDATE plan_projects SET
        title = ${data.title.trim()},
        description = ${data.description?.trim() || null},
        purpose_meaning = ${data.purpose_meaning?.trim() || null},
        problem_solved = ${data.problem_solved?.trim() || null},
        willingness_to_pay = ${data.willingness_to_pay?.trim() || null},
        potential_notes = ${data.potential_notes?.trim() || null},
        progress_notes = ${data.progress_notes?.trim() || null},
        sentiment_pct = ${data.sentiment_pct ?? null},
        planned_investment = ${data.planned_investment ?? null},
        expected_return = ${data.expected_return ?? null},
        currency = ${data.currency || 'CZK'},
        status = ${data.status},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/hub/plany/projekty/${id}`)
    revalidatePath('/hub/plany/projekty')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit nápad' }
  }
}

export async function deletePlanProject(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE plan_projects SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/plany/projekty')
  revalidatePath('/hub/plany')
  revalidatePath('/hub')
}

export async function setProjectActions(
  projectId: string,
  actions: { content: string; done: boolean }[]
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    const cleaned = actions.filter((a) => a.content?.trim()).slice(0, 5)

    await sql`DELETE FROM plan_project_actions WHERE project_id = ${projectId}`
    for (let i = 0; i < cleaned.length; i++) {
      await sql`
        INSERT INTO plan_project_actions (project_id, content, position, done)
        VALUES (${projectId}, ${cleaned[i].content.trim()}, ${i + 1}, ${cleaned[i].done})
      `
    }
    revalidatePath(`/hub/plany/projekty/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit kroky' }
  }
}

export async function moveProjectToBusiness(id: string): Promise<{ businessId?: string; error?: string }> {
  try {
    await requireAuth()
    const rows = await sql`SELECT * FROM plan_projects WHERE id = ${id} LIMIT 1`
    const p = rows[0] as { status: string; title: string; purpose_meaning: string | null; problem_solved: string | null } | undefined
    if (!p) return { error: 'Nápad nenalezen' }
    if (p.status !== 'schvaleno') return { error: 'Nápad musí být nejdřív schválen' }

    const goals = [p.purpose_meaning, p.problem_solved].filter(Boolean).join('\n\n')
    const result = await sql`
      INSERT INTO plan_businesses (source_project_id, title, goals)
      VALUES (${id}, ${p.title}, ${goals || null})
      RETURNING id::text AS id
    `
    const businessId = (result[0] as { id: string }).id

    await sql`UPDATE plan_projects SET status = 'prevedeno_do_byznysu', updated_at = now() WHERE id = ${id}`

    revalidatePath('/hub/plany/projekty')
    revalidatePath('/hub/plany/byznys')
    revalidatePath('/hub/plany')
    return { businessId }
  } catch {
    return { error: 'Nepodařilo se přesunout nápad do byznys strategie' }
  }
}
