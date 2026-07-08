'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createStartupProject } from '@/app/hub/byznys/startup/startup-actions'

export type PlanBusinessStatus = 'planovani' | 'pripraveno_k_exportu' | 'exportovano'
export type PlanBusinessPhaseStatus = 'planovana' | 'aktivni' | 'hotovo'

export interface PlanBusiness {
  id: string
  source_project_id: string | null
  title: string
  goals: string | null
  current_situation: string | null
  growth_goals: string | null
  vision_10y: string | null
  budget: number | null
  currency: string
  status: PlanBusinessStatus
  exported_startup_id: string | null
  created_at: string
  updated_at: string | null
}

export interface PlanBusinessPhase {
  id: string
  business_id: string
  title: string
  description: string | null
  status: PlanBusinessPhaseStatus
  position: number
  target_date: string | null
  created_at: string
}

export interface PlanBusinessPayload {
  title: string
  goals?: string
  current_situation?: string
  growth_goals?: string
  vision_10y?: string
  budget?: number | null
  currency?: string
  status: PlanBusinessStatus
}

export interface PlanBusinessPhasePayload {
  title: string
  description?: string
  status: PlanBusinessPhaseStatus
  position?: number
  target_date?: string | null
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getBusinesses(): Promise<PlanBusiness[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, source_project_id::text, title, goals, current_situation, growth_goals,
      vision_10y, budget::float, currency, status, exported_startup_id::text,
      created_at::text, updated_at::text
    FROM plan_businesses
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as PlanBusiness[]
}

export async function getBusiness(id: string): Promise<PlanBusiness | null> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, source_project_id::text, title, goals, current_situation, growth_goals,
      vision_10y, budget::float, currency, status, exported_startup_id::text,
      created_at::text, updated_at::text
    FROM plan_businesses
    WHERE id = ${id}
    LIMIT 1
  `
  return (rows[0] as PlanBusiness) ?? null
}

export async function getBusinessPhases(businessId: string): Promise<PlanBusinessPhase[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, business_id::text, title, description, status, position, target_date::text, created_at::text
    FROM plan_business_phases
    WHERE business_id = ${businessId}
    ORDER BY position ASC, created_at ASC
  `
  return rows as PlanBusinessPhase[]
}

export async function createBusiness(data: PlanBusinessPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    const rows = await sql`
      INSERT INTO plan_businesses (title, goals, current_situation, growth_goals, vision_10y, budget, currency, status)
      VALUES (
        ${data.title.trim()},
        ${data.goals?.trim() || null},
        ${data.current_situation?.trim() || null},
        ${data.growth_goals?.trim() || null},
        ${data.vision_10y?.trim() || null},
        ${data.budget ?? null},
        ${data.currency || 'CZK'},
        ${data.status}
      )
      RETURNING id::text AS id
    `
    revalidatePath('/hub/plany/byznys')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit strategii' }
  }
}

export async function updateBusiness(id: string, data: PlanBusinessPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.status) return { error: 'Status je povinný' }

    await sql`
      UPDATE plan_businesses SET
        title = ${data.title.trim()},
        goals = ${data.goals?.trim() || null},
        current_situation = ${data.current_situation?.trim() || null},
        growth_goals = ${data.growth_goals?.trim() || null},
        vision_10y = ${data.vision_10y?.trim() || null},
        budget = ${data.budget ?? null},
        currency = ${data.currency || 'CZK'},
        status = ${data.status},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath(`/hub/plany/byznys/${id}`)
    revalidatePath('/hub/plany/byznys')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit strategii' }
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE plan_businesses SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/plany/byznys')
  revalidatePath('/hub/plany')
  revalidatePath('/hub')
}

export async function addBusinessPhase(
  businessId: string,
  data: PlanBusinessPhasePayload
): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název fáze je povinný' }

    const rows = await sql`
      INSERT INTO plan_business_phases (business_id, title, description, status, position, target_date)
      VALUES (
        ${businessId},
        ${data.title.trim()},
        ${data.description?.trim() || null},
        ${data.status || 'planovana'},
        ${data.position ?? 1},
        ${data.target_date || null}
      )
      RETURNING id::text AS id
    `
    revalidatePath(`/hub/plany/byznys/${businessId}`)
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se přidat fázi' }
  }
}

export async function updateBusinessPhase(
  id: string,
  businessId: string,
  data: PlanBusinessPhasePayload
): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název fáze je povinný' }

    await sql`
      UPDATE plan_business_phases SET
        title = ${data.title.trim()},
        description = ${data.description?.trim() || null},
        status = ${data.status},
        position = ${data.position ?? 1},
        target_date = ${data.target_date || null}
      WHERE id = ${id}
    `
    revalidatePath(`/hub/plany/byznys/${businessId}`)
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit fázi' }
  }
}

export async function deleteBusinessPhase(id: string, businessId: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM plan_business_phases WHERE id = ${id}`
  revalidatePath(`/hub/plany/byznys/${businessId}`)
}

export async function exportBusinessToStartup(
  id: string,
  segment: string
): Promise<{ startupId?: string; error?: string }> {
  try {
    await requireAuth()
    if (!segment?.trim()) return { error: 'Segment je povinný' }

    const rows = await sql`SELECT * FROM plan_businesses WHERE id = ${id} LIMIT 1`
    const b = rows[0] as { status: string; title: string; goals: string | null; current_situation: string | null } | undefined
    if (!b) return { error: 'Strategie nenalezena' }
    if (b.status !== 'pripraveno_k_exportu') return { error: 'Strategie musí být nejdřív připravena k exportu' }

    const result = await createStartupProject({
      name: b.title,
      segment: segment.trim(),
      problem: b.goals || b.current_situation || b.title,
      monetization: false,
    })
    if (result.error || !result.id) return { error: result.error || 'Nepodařilo se vytvořit startup projekt' }

    await sql`
      UPDATE plan_businesses SET exported_startup_id = ${result.id}, status = 'exportovano', updated_at = now()
      WHERE id = ${id}
    `

    revalidatePath('/hub/plany/byznys')
    revalidatePath('/hub/byznys/startup')
    revalidatePath('/hub/plany')
    return { startupId: result.id }
  } catch {
    return { error: 'Nepodařilo se exportovat do sekce Byznys' }
  }
}
