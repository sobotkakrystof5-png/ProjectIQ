'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type {
  PersonalProject,
  PersonalProjectImprovement,
  PersonalProjectChangelogEntry,
  StartupPhase,
} from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getPersonalProjects(): Promise<PersonalProject[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, segment, problem, description, tech_stack,
      github_url, live_url, monetization, phase,
      progress::int, currency,
      planned_investment::float,
      notes, archived, created_at::text, updated_at::text
    FROM personal_projects
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as PersonalProject[]
}

export async function getPersonalProject(id: string): Promise<PersonalProject | null> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, segment, problem, description, tech_stack,
      github_url, live_url, monetization, phase,
      progress::int, currency,
      planned_investment::float,
      notes, archived, created_at::text, updated_at::text
    FROM personal_projects
    WHERE id = ${id}
    LIMIT 1
  `
  return (rows[0] as PersonalProject) ?? null
}

export async function createPersonalProject(data: {
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
      INSERT INTO personal_projects (name, segment, problem, monetization)
      VALUES (${data.name.trim()}, ${data.segment.trim()}, ${data.problem.trim()}, ${data.monetization})
      RETURNING id::text
    `
    revalidatePath('/dashboard/projekty')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se vytvořit projekt' }
  }
}

export async function updatePersonalProject(
  id: string,
  data: {
    name: string
    segment: string
    problem: string
    description: string | null
    tech_stack: string | null
    github_url: string | null
    live_url: string | null
    monetization: boolean
    phase: StartupPhase
    progress: number
    currency: string
    planned_investment: number | null
    notes: string | null
  }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.name?.trim()) return { error: 'Název projektu je povinný' }
    if (!data.segment?.trim()) return { error: 'Segment je povinný' }
    if (!data.problem?.trim()) return { error: 'Popis problému je povinný' }

    await sql`
      UPDATE personal_projects SET
        name = ${data.name.trim()},
        segment = ${data.segment.trim()},
        problem = ${data.problem.trim()},
        description = ${data.description},
        tech_stack = ${data.tech_stack},
        github_url = ${data.github_url},
        live_url = ${data.live_url},
        monetization = ${data.monetization},
        phase = ${data.phase},
        progress = ${data.progress},
        currency = ${data.currency},
        planned_investment = ${data.planned_investment},
        notes = ${data.notes},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/dashboard/projekty/${id}`)
    revalidatePath('/dashboard/projekty')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit projekt' }
  }
}

export async function archivePersonalProject(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE personal_projects SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/dashboard/projekty')
  redirect('/dashboard/projekty')
}

export async function deletePersonalProject(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM personal_projects WHERE id = ${id}`
  revalidatePath('/dashboard/projekty')
  redirect('/dashboard/projekty')
}

export async function publishToStartup(id: string): Promise<{ startupId?: string; error?: string }> {
  try {
    await requireAuth()
    const rows = await sql`SELECT * FROM personal_projects WHERE id = ${id} LIMIT 1`
    const p = rows[0]
    if (!p) return { error: 'Projekt nenalezen' }

    const result = await sql`
      INSERT INTO startup_projects (name, segment, problem, monetization, plan, notes, live_url, phase, progress, currency, planned_investment)
      VALUES (${p.name}, ${p.segment}, ${p.problem}, ${p.monetization}, ${p.description}, ${p.notes}, ${p.live_url}, ${p.phase}, ${p.progress}, ${p.currency}, ${p.planned_investment})
      RETURNING id::text
    `
    const startupId = (result[0] as { id: string }).id

    const improvements = await sql`SELECT * FROM personal_project_improvements WHERE personal_project_id = ${id}`
    for (const imp of improvements) {
      await sql`
        INSERT INTO startup_improvements (startup_project_id, content, status)
        VALUES (${startupId}, ${imp.content}, ${imp.status})
      `
    }

    const changelog = await sql`SELECT * FROM personal_project_changelog WHERE personal_project_id = ${id}`
    for (const entry of changelog) {
      await sql`
        INSERT INTO startup_changelog (startup_project_id, change_date, change_type, description, progress_from, progress_to)
        VALUES (${startupId}, ${entry.change_date}, ${entry.change_type}, ${entry.description}, ${entry.progress_from}, ${entry.progress_to})
      `
    }

    await sql`UPDATE personal_projects SET archived = true, updated_at = now() WHERE id = ${id}`

    revalidatePath('/dashboard/projekty')
    revalidatePath('/hub/byznys/startup')
    return { startupId }
  } catch {
    return { error: 'Nepodařilo se zveřejnit projekt' }
  }
}

// ─── Improvements ─────────────────────────────────────────────────────────────

export async function getPersonalProjectImprovements(projectId: string): Promise<PersonalProjectImprovement[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, personal_project_id::text, content, status,
      created_at::text, updated_at::text
    FROM personal_project_improvements
    WHERE personal_project_id = ${projectId}
    ORDER BY created_at ASC
  `
  return rows as PersonalProjectImprovement[]
}

export async function addPersonalImprovement(
  projectId: string,
  content: string
): Promise<{ error?: string; item?: PersonalProjectImprovement }> {
  try {
    await requireAuth()
    if (!content?.trim()) return { error: 'Text nápadu je povinný' }
    const rows = await sql`
      INSERT INTO personal_project_improvements (personal_project_id, content)
      VALUES (${projectId}, ${content.trim()})
      RETURNING id::text, personal_project_id::text, content, status,
        created_at::text, updated_at::text
    `
    revalidatePath(`/dashboard/projekty/${projectId}`)
    return { item: rows[0] as PersonalProjectImprovement }
  } catch {
    return { error: 'Nepodařilo se přidat nápad' }
  }
}

export async function updatePersonalImprovement(
  id: string,
  projectId: string,
  data: { content?: string; status?: string }
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`
      UPDATE personal_project_improvements SET
        content = COALESCE(${data.content ?? null}, content),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/dashboard/projekty/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se aktualizovat nápad' }
  }
}

export async function deletePersonalImprovement(id: string, projectId: string): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`DELETE FROM personal_project_improvements WHERE id = ${id}`
    revalidatePath(`/dashboard/projekty/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se smazat nápad' }
  }
}

// ─── Changelog ────────────────────────────────────────────────────────────────

export async function getPersonalProjectChangelog(projectId: string): Promise<PersonalProjectChangelogEntry[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, personal_project_id::text, change_date::text, change_type,
      description, progress_from::int, progress_to::int, created_at::text
    FROM personal_project_changelog
    WHERE personal_project_id = ${projectId}
    ORDER BY change_date DESC, created_at DESC
  `
  return rows as PersonalProjectChangelogEntry[]
}

export async function addPersonalChangelogEntry(
  projectId: string,
  data: {
    change_date: string
    change_type: string
    description: string
    progress_from: number | null
    progress_to: number | null
  }
): Promise<{ error?: string; entry?: PersonalProjectChangelogEntry }> {
  try {
    await requireAuth()
    if (!data.description?.trim()) return { error: 'Popis změny je povinný' }
    if (!data.change_type) return { error: 'Typ změny je povinný' }
    const rows = await sql`
      INSERT INTO personal_project_changelog
        (personal_project_id, change_date, change_type, description, progress_from, progress_to)
      VALUES (
        ${projectId}, ${data.change_date}, ${data.change_type},
        ${data.description.trim()}, ${data.progress_from}, ${data.progress_to}
      )
      RETURNING id::text, personal_project_id::text, change_date::text, change_type,
        description, progress_from::int, progress_to::int, created_at::text
    `
    revalidatePath(`/dashboard/projekty/${projectId}`)
    return { entry: rows[0] as PersonalProjectChangelogEntry }
  } catch {
    return { error: 'Nepodařilo se přidat záznam' }
  }
}

export async function deletePersonalChangelogEntry(
  id: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    await sql`DELETE FROM personal_project_changelog WHERE id = ${id}`
    revalidatePath(`/dashboard/projekty/${projectId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se smazat záznam' }
  }
}
