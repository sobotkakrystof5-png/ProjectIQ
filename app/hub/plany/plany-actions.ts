'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type PlanCategory = 'byznys' | 'osobni' | 'technologie' | 'vzdelavani' | 'jine'
export type PlanStatus = 'napad' | 'analyza' | 'rozhodnuto_ano' | 'rozhodnuto_ne' | 'aktivni'

export interface Plan {
  id: string
  title: string
  description: string | null
  category: PlanCategory
  status: PlanStatus
  potential_value: number | null
  effort_score: number | null
  risk_score: number | null
  next_step: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface PlanPayload {
  title: string
  description?: string
  category: PlanCategory
  status: PlanStatus
  potential_value?: number | null
  effort_score?: number | null
  risk_score?: number | null
  next_step?: string
  notes?: string
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getPlans(): Promise<Plan[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text,
      title,
      description,
      category,
      status,
      potential_value::float AS potential_value,
      effort_score,
      risk_score,
      next_step,
      notes,
      created_at::text,
      updated_at::text
    FROM plans
    ORDER BY created_at DESC
  `
  return rows as Plan[]
}

export async function createPlan(data: PlanPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.category) return { error: 'Kategorie je povinná' }
    if (!data.status) return { error: 'Status je povinný' }

    const rows = await sql`
      INSERT INTO plans (
        title, description, category, status,
        potential_value, effort_score, risk_score, next_step, notes
      )
      VALUES (
        ${data.title.trim()},
        ${data.description?.trim() || null},
        ${data.category},
        ${data.status},
        ${data.potential_value ?? null},
        ${data.effort_score ?? null},
        ${data.risk_score ?? null},
        ${data.next_step?.trim() || null},
        ${data.notes?.trim() || null}
      )
      RETURNING id::text AS id
    `

    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit plán' }
  }
}

export async function updatePlan(id: string, data: PlanPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.category) return { error: 'Kategorie je povinná' }
    if (!data.status) return { error: 'Status je povinný' }

    await sql`
      UPDATE plans SET
        title = ${data.title.trim()},
        description = ${data.description?.trim() || null},
        category = ${data.category},
        status = ${data.status},
        potential_value = ${data.potential_value ?? null},
        effort_score = ${data.effort_score ?? null},
        risk_score = ${data.risk_score ?? null},
        next_step = ${data.next_step?.trim() || null},
        notes = ${data.notes?.trim() || null},
        updated_at = now()
      WHERE id = ${id}
    `

    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit plán' }
  }
}

export async function deletePlan(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM plans WHERE id = ${id}`
  revalidatePath('/hub/plany')
  revalidatePath('/hub')
}
