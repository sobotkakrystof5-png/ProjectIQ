'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface PlanFinanceGoal {
  id: string
  title: string
  target_amount: number
  period: string | null
  target_date: string | null
  current_amount: number
  notes: string | null
  created_at: string
  updated_at: string | null
}

export interface PlanFinanceGoalPayload {
  title: string
  target_amount: number
  period?: string
  target_date?: string | null
  current_amount?: number
  notes?: string
}

export interface PlanSavingsSnapshot {
  id: string
  snapshot_date: string
  amount: number
  note: string | null
  created_at: string
}

export type WishlistItemType = 'nakup' | 'investice'
export type WishlistItemStatus = 'aktivni' | 'splneno' | 'zruseno'

export interface PlanWishlistItem {
  id: string
  item_type: WishlistItemType
  title: string
  target_amount: number
  saved_amount: number
  purpose: string | null
  expected_return_pct: number | null
  status: WishlistItemStatus
  created_at: string
  updated_at: string | null
}

export interface PlanWishlistItemPayload {
  item_type: WishlistItemType
  title: string
  target_amount: number
  saved_amount?: number
  purpose?: string
  expected_return_pct?: number | null
  status: WishlistItemStatus
}

export interface SavingsTrend {
  current: number | null
  momPct: number | null
  yoyPct: number | null
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

// ─── Finance goals ─────────────────────────────────────────────────────────

export async function getFinanceGoals(): Promise<PlanFinanceGoal[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, title, target_amount::float, period, target_date::text,
      current_amount::float, notes, created_at::text, updated_at::text
    FROM plan_finance_goals
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as PlanFinanceGoal[]
}

export async function createFinanceGoal(data: PlanFinanceGoalPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.target_amount) return { error: 'Cílová částka je povinná' }

    const rows = await sql`
      INSERT INTO plan_finance_goals (title, target_amount, period, target_date, current_amount, notes)
      VALUES (
        ${data.title.trim()}, ${data.target_amount}, ${data.period?.trim() || null},
        ${data.target_date || null}, ${data.current_amount ?? 0}, ${data.notes?.trim() || null}
      )
      RETURNING id::text AS id
    `
    revalidatePath('/hub/plany/finance')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit cíl' }
  }
}

export async function updateFinanceGoal(id: string, data: PlanFinanceGoalPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.target_amount) return { error: 'Cílová částka je povinná' }

    await sql`
      UPDATE plan_finance_goals SET
        title = ${data.title.trim()},
        target_amount = ${data.target_amount},
        period = ${data.period?.trim() || null},
        target_date = ${data.target_date || null},
        current_amount = ${data.current_amount ?? 0},
        notes = ${data.notes?.trim() || null},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath('/hub/plany/finance')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit cíl' }
  }
}

export async function deleteFinanceGoal(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE plan_finance_goals SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/plany/finance')
  revalidatePath('/hub/plany')
  revalidatePath('/hub')
}

// ─── Savings snapshots ───────────────────────────────────────────────────────

export async function getSavingsSnapshots(): Promise<PlanSavingsSnapshot[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, snapshot_date::text, amount::float, note, created_at::text
    FROM plan_savings_snapshots
    ORDER BY snapshot_date DESC
  `
  return rows as PlanSavingsSnapshot[]
}

export async function addSavingsSnapshot(data: {
  amount: number
  snapshot_date?: string
  note?: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (data.amount === undefined || data.amount === null) return { error: 'Částka je povinná' }

    await sql`
      INSERT INTO plan_savings_snapshots (snapshot_date, amount, note)
      VALUES (${data.snapshot_date || new Date().toISOString().slice(0, 10)}, ${data.amount}, ${data.note?.trim() || null})
    `
    revalidatePath('/hub/plany/finance')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit záznam úspor' }
  }
}

export async function deleteSavingsSnapshot(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM plan_savings_snapshots WHERE id = ${id}`
  revalidatePath('/hub/plany/finance')
}

export async function getSavingsTrend(): Promise<SavingsTrend> {
  await requireAuth()
  const snapshots = await sql`
    SELECT snapshot_date::text, amount::float
    FROM plan_savings_snapshots
    ORDER BY snapshot_date DESC
  `
  const rows = snapshots as { snapshot_date: string; amount: number }[]
  if (rows.length === 0) return { current: null, momPct: null, yoyPct: null }

  const current = rows[0].amount
  const currentDate = new Date(rows[0].snapshot_date)

  const findClosestBefore = (targetDate: Date) =>
    rows.find((r) => new Date(r.snapshot_date).getTime() <= targetDate.getTime())

  const oneMonthAgo = new Date(currentDate)
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const momRow = findClosestBefore(oneMonthAgo)

  const oneYearAgo = new Date(currentDate)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const yoyRow = findClosestBefore(oneYearAgo)

  const pctChange = (from: number | undefined) =>
    from === undefined || from === 0 ? null : ((current - from) / Math.abs(from)) * 100

  return {
    current,
    momPct: pctChange(momRow?.amount),
    yoyPct: pctChange(yoyRow?.amount),
  }
}

// ─── Wishlist / investice (sdílená tabulka, liší se item_type) ─────────────

export async function getWishlistItems(): Promise<PlanWishlistItem[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, item_type, title, target_amount::float, saved_amount::float,
      purpose, expected_return_pct::float, status, created_at::text, updated_at::text
    FROM plan_wishlist_items
    WHERE archived = false
    ORDER BY created_at DESC
  `
  return rows as PlanWishlistItem[]
}

export async function createWishlistItem(data: PlanWishlistItemPayload): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.target_amount) return { error: 'Cílová částka je povinná' }
    if (!data.item_type) return { error: 'Typ položky je povinný' }

    const rows = await sql`
      INSERT INTO plan_wishlist_items (item_type, title, target_amount, saved_amount, purpose, expected_return_pct, status)
      VALUES (
        ${data.item_type}, ${data.title.trim()}, ${data.target_amount}, ${data.saved_amount ?? 0},
        ${data.purpose?.trim() || null}, ${data.expected_return_pct ?? null}, ${data.status || 'aktivni'}
      )
      RETURNING id::text AS id
    `
    revalidatePath('/hub/plany/finance')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return { id: (rows[0] as { id: string }).id }
  } catch {
    return { error: 'Nepodařilo se uložit položku' }
  }
}

export async function updateWishlistItem(id: string, data: PlanWishlistItemPayload): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název je povinný' }
    if (!data.target_amount) return { error: 'Cílová částka je povinná' }

    await sql`
      UPDATE plan_wishlist_items SET
        title = ${data.title.trim()},
        target_amount = ${data.target_amount},
        saved_amount = ${data.saved_amount ?? 0},
        purpose = ${data.purpose?.trim() || null},
        expected_return_pct = ${data.expected_return_pct ?? null},
        status = ${data.status},
        updated_at = now()
      WHERE id = ${id}
    `
    revalidatePath('/hub/plany/finance')
    revalidatePath('/hub/plany')
    revalidatePath('/hub')
    return {}
  } catch {
    return { error: 'Nepodařilo se upravit položku' }
  }
}

export async function deleteWishlistItem(id: string): Promise<void> {
  await requireAuth()
  await sql`UPDATE plan_wishlist_items SET archived = true, updated_at = now() WHERE id = ${id}`
  revalidatePath('/hub/plany/finance')
  revalidatePath('/hub/plany')
  revalidatePath('/hub')
}
