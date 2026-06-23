'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type {
  StartupProject,
  StartupImprovement,
  StartupChangelogEntry,
  StartupPhase,
  MonetizationModel,
} from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getStartupProjects(): Promise<StartupProject[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, segment, problem, monetization,
      plan, know_how, notes, live_url, phase,
      progress::int, currency,
      planned_investment::float,
      total_users::int,
      paying_users_pct::float,
      monetization_model,
      monthly_price::float, annual_price::float,
      annual_discount_pct::float, onetime_price::float,
      archived, created_at::text, updated_at::text
    FROM startup_projects
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as StartupProject[]
}

export async function getStartupProject(id: string): Promise<StartupProject | null> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, segment, problem, monetization,
      plan, know_how, notes, live_url, phase,
      progress::int, currency,
      planned_investment::float,
      total_users::int,
      paying_users_pct::float,
      monetization_model,
      monthly_price::float, annual_price::float,
      annual_discount_pct::float, onetime_price::float,
      archived, created_at::text, updated_at::text
    FROM startup_projects
    WHERE id = ${id}
    LIMIT 1
  `
  return (rows[0] as StartupProject) ?? null
}

export async function createStartupProject(data: {
  name: string
  segment: string
  problem: string
  monetization: boolean
}): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.name?.trim()) return { error: 'Název projektu je povinný' }
    if (!data.segment?.trim()) return { error: 'Segment je povinný' }
    if (!data.problem?.trim()) return { error: 'Popis problému je povinný' }

    const rows = await sql`
      INSERT INTO startup_projects (name, segment, problem, monetization)
      VALUES (${data.name.trim()}, ${data.segment.trim()}, ${data.problem.trim()}, ${data.monetization})
      RETURNING id::text
    `
    revalidatePath('/hub/byznys/startup')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se vytvořit projekt' }
  }
}

export async function updateStartupProject(
  id: string,
  data: {
    name: string
    segment: string
    problem: string
    monetization: boolean
    plan: string | null
    know_how: string | null
    notes: string | null
    live_url: string | null
    phase: StartupPhase
    progress: number
    currency: string
    planned_investment: number | null
    total_users: number | null
    paying_users_pct: number | null
    monetization_model: MonetizationModel
    monthly_price: number | null
    annual_price: number | null
    annual_discount_pct: number | null
    onetime_price: number | null
  }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.name?.trim()) return { error: 'Název projektu je povinný' }
    if (!data.segment?.trim()) return { error: 'Segment je povinný' }
    if (!data.problem?.trim()) return { error: 'Popis problému je povinný' }

    await sql`
      UPDATE startup_projects SET
        name = ${data.name.trim()},
        segment = ${data.segment.trim()},
        problem = ${data.problem.trim()},
        monetization = ${data.monetization},
        plan = ${data.plan},
        know_how = ${data.know_how},
        notes = ${data.notes},
        live_url = ${data.live_url},
        phase = ${data.phase},
        progress = ${data.progress},
        currency = ${data.currency},
        planned_investment = ${data.planned_investment},
        total_users = ${data.total_users},
        paying_users_pct = ${data.paying_users_pct},
        monetization_model = ${data.monetization_model},
        monthly_price = ${data.monthly_price},
        annual_price = ${data.annual_price},
        annual_discount_pct = ${data.annual_discount_pct},
        onetime_price = ${data.onetime_price},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/hub/byznys/startup/${id}`)
    revalidatePath('/hub/byznys/startup')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit projekt' }
  }
}

export async function archiveStartupProject(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE startup_projects SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/byznys/startup')
  redirect('/hub/byznys/startup')
}

export async function deleteStartupProject(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM startup_projects WHERE id = ${id}`
  revalidatePath('/hub/byznys/startup')
  redirect('/hub/byznys/startup')
}

// ─── Improvements ─────────────────────────────────────────────────────────────

export async function getStartupImprovements(projectId: string): Promise<StartupImprovement[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, startup_project_id::text, content, status,
      created_at::text, updated_at::text
    FROM startup_improvements
    WHERE startup_project_id = ${projectId}
    ORDER BY created_at ASC
  `
  return rows as StartupImprovement[]
}

export async function addImprovement(
  projectId: string,
  content: string
): Promise<{ error?: string; item?: StartupImprovement }> {
  try {
    await requireAuth()
    if (!content?.trim()) return { error: 'Text nápadu je povinný' }
    const rows = await sql`
      INSERT INTO startup_improvements (startup_project_id, content)
      VALUES (${projectId}, ${content.trim()})
      RETURNING id::text, startup_project_id::text, content, status,
        created_at::text, updated_at::text
    `
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return { item: rows[0] as StartupImprovement }
  } catch {
    return { error: 'Nepodařilo se přidat nápad' }
  }
}

export async function updateImprovement(
  id: string,
  projectId: string,
  data: { content?: string; status?: string }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`
      UPDATE startup_improvements SET
        content = COALESCE(${data.content ?? null}, content),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se aktualizovat nápad' }
  }
}

export async function deleteImprovement(id: string, projectId: string): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`DELETE FROM startup_improvements WHERE id = ${id}`
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se smazat nápad' }
  }
}

// ─── Changelog ────────────────────────────────────────────────────────────────

export async function getStartupChangelog(projectId: string): Promise<StartupChangelogEntry[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, startup_project_id::text, change_date::text, change_type,
      description, progress_from::int, progress_to::int, created_at::text
    FROM startup_changelog
    WHERE startup_project_id = ${projectId}
    ORDER BY change_date DESC, created_at DESC
  `
  return rows as StartupChangelogEntry[]
}

export async function addChangelogEntry(
  projectId: string,
  data: {
    change_date: string
    change_type: string
    description: string
    progress_from: number | null
    progress_to: number | null
  }
): Promise<{ error?: string; entry?: StartupChangelogEntry }> {
  try {
    await requireAuth()
    if (!data.description?.trim()) return { error: 'Popis změny je povinný' }
    if (!data.change_type) return { error: 'Typ změny je povinný' }
    const rows = await sql`
      INSERT INTO startup_changelog
        (startup_project_id, change_date, change_type, description, progress_from, progress_to)
      VALUES (
        ${projectId}, ${data.change_date}, ${data.change_type},
        ${data.description.trim()}, ${data.progress_from}, ${data.progress_to}
      )
      RETURNING id::text, startup_project_id::text, change_date::text, change_type,
        description, progress_from::int, progress_to::int, created_at::text
    `
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return { entry: rows[0] as StartupChangelogEntry }
  } catch {
    return { error: 'Nepodařilo se přidat záznam' }
  }
}

export async function deleteChangelogEntry(
  id: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`DELETE FROM startup_changelog WHERE id = ${id}`
    revalidatePath(`/hub/byznys/startup/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se smazat záznam' }
  }
}
