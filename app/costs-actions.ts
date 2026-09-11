'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import type { Cost, CostType, CostCategory } from '@/lib/types'

export type CostPayload = {
  name: string
  amount: number
  cost_type: CostType
  category: CostCategory
  description: string | null
  project_id: string | null
}

function revalidateCostPaths(projectId: string | null) {
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
  revalidatePath('/hub/finance')
  if (projectId) revalidatePath(`/dashboard/${projectId}`)
}

export async function getCosts(): Promise<Cost[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, amount::float AS amount, cost_type, category, description,
      project_id::text, source_finance_transaction_id::text, created_at::text
    FROM costs
    ORDER BY cost_type, created_at DESC
  `
  return rows as Cost[]
}

/**
 * Náklady jedné zakázky — pro panel na detailu zakázky. Zdroj pravdy pro
 * Hub/naklady u probíhajících zakázek (na rozdíl od `estimated_costs`, což
 * je jen orientační odhad při zakládání).
 */
export async function getProjectCosts(projectId: string): Promise<Cost[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, name, amount::float AS amount, cost_type, category, description,
      project_id::text, source_finance_transaction_id::text, created_at::text
    FROM costs
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `
  return rows as Cost[]
}

export async function createCost(payload: CostPayload) {
  await requireAuth()
  const rows = await sql`
    INSERT INTO costs (name, amount, cost_type, category, description, project_id)
    VALUES (${payload.name}, ${payload.amount}, ${payload.cost_type}, ${payload.category}, ${payload.description}, ${payload.project_id})
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
  revalidateCostPaths(payload.project_id)
}

export async function updateCost(id: string, payload: CostPayload) {
  await requireAuth()
  await sql`
    UPDATE costs SET
      name = ${payload.name},
      amount = ${payload.amount},
      cost_type = ${payload.cost_type},
      category = ${payload.category},
      description = ${payload.description},
      project_id = ${payload.project_id}
    WHERE id = ${id}
  `
  // Sync linked finance transaction (platí jen pro one_time) — upsert, protože
  // úprava z jiného typu na one_time nebo z amount 0 by jinak UPDATE nic
  // netrefil a transakce by nikdy nevznikla.
  if (payload.cost_type === 'one_time' && payload.amount > 0) {
    const updated = await sql`
      UPDATE finance_transactions
      SET amount = ${payload.amount}, note = ${payload.name}
      WHERE source_cost_id = ${id}
      RETURNING id
    `
    if (updated.length === 0) {
      await sql`
        INSERT INTO finance_transactions (amount, type, category, note, date, user_id, source_cost_id)
        VALUES (${payload.amount}, 'expense', 'náklady', ${payload.name}, now()::date, NULL, ${id})
      `
    }
  } else {
    await sql`DELETE FROM finance_transactions WHERE source_cost_id = ${id}`
  }
  revalidateCostPaths(payload.project_id)
}

export async function deleteCost(id: string, projectId: string | null = null) {
  await requireAuth()
  // Smazat provázanou finanční transakci — náklad a jeho záznam v cash flow jsou jeden celek
  await sql`DELETE FROM finance_transactions WHERE source_cost_id = ${id}`
  await sql`DELETE FROM costs WHERE id = ${id}`
  revalidateCostPaths(projectId)
}
