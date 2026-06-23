'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type TransactionType = 'income' | 'expense'
export type CostType = 'fixed_monthly' | 'fixed_annual' | 'one_time'
export type RecurringFrequency = 'monthly' | 'annual'

export interface Cost {
  id: string
  name: string
  amount: number
  cost_type: CostType
  category: string
  description: string | null
  source_finance_transaction_id: string | null
  created_at: string
}

export interface FinanceTransaction {
  id: string
  amount: number
  type: TransactionType
  category: string
  note: string | null
  area: string | null
  date: string
  created_at: string
}

export interface RecurringCashFlow {
  id: string
  type: TransactionType
  amount: number
  frequency: RecurringFrequency
  area: string | null
  category: string
  description: string | null
  created_at: string
}

export interface MonthlyAggregate {
  month: string // 'yyyy-MM'
  income: number
  expense: number
}

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function getTransactions(month: string): Promise<FinanceTransaction[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text,
      amount::float AS amount,
      type,
      category,
      note,
      area,
      date::text,
      created_at::text
    FROM finance_transactions
    WHERE user_id IS NULL
      AND to_char(date, 'YYYY-MM') = ${month}
      AND source_recurring_cash_flow_id IS NULL
    ORDER BY date DESC, created_at DESC
  `
  return rows as FinanceTransaction[]
}

export async function getMonthlyAggregates(): Promise<MonthlyAggregate[]> {
  await requireAuth()

  const months: MonthlyAggregate[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    months.push({ month: `${yyyy}-${mm}`, income: 0, expense: 0 })
  }

  const rows = await sql`
    SELECT
      to_char(date, 'YYYY-MM') AS month,
      type,
      SUM(amount)::float AS total
    FROM finance_transactions
    WHERE user_id IS NULL
      AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '5 months')
    GROUP BY 1, 2
    ORDER BY 1
  `

  for (const row of rows as any[]) {
    const m = months.find(x => x.month === row.month)
    if (!m) continue
    if (row.type === 'income') m.income = row.total
    else m.expense = row.total
  }

  return months
}

export async function createTransaction(data: {
  amount: number
  type: TransactionType
  category: string
  note?: string
  area?: string | null
  date: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()

    if (!data.amount || data.amount <= 0) return { error: 'Neplatná částka' }
    if (!['income', 'expense'].includes(data.type)) return { error: 'Neplatný typ' }
    if (!data.category?.trim()) return { error: 'Kategorie je povinná' }
    if (!data.date) return { error: 'Datum je povinné' }

    const rows = await sql`
      INSERT INTO finance_transactions (amount, type, category, note, area, date, user_id)
      VALUES (
        ${data.amount},
        ${data.type},
        ${data.category},
        ${data.note?.trim() || null},
        ${data.area || null},
        ${data.date},
        NULL
      )
      RETURNING id::text AS id
    `

    // Byznys výdaj → automaticky přidat do nákladů
    if (data.type === 'expense' && data.area === 'byznys') {
      const transactionId = (rows[0] as { id: string }).id
      const name = data.note?.trim() || data.category
      await sql`
        INSERT INTO costs (name, amount, cost_type, category, description, source_finance_transaction_id)
        VALUES (
          ${name},
          ${data.amount},
          'one_time',
          'byznys',
          ${data.note?.trim() || null},
          ${transactionId}::uuid
        )
      `
      revalidatePath('/dashboard/naklady')
      revalidatePath('/dashboard/dokoncene')
    }

    revalidatePath('/hub/finance')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit transakci' }
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  await requireAuth()
  // Smazat linked byznys cost
  await sql`DELETE FROM costs WHERE source_finance_transaction_id = ${id}::uuid`
  await sql`DELETE FROM finance_transactions WHERE id = ${id} AND user_id IS NULL`
  revalidatePath('/hub/finance')
  revalidatePath('/dashboard/naklady')
  revalidatePath('/dashboard/dokoncene')
}

// --- Recurring cash flow ---

export async function getRecurringCashFlow(): Promise<RecurringCashFlow[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text,
      type,
      amount::float AS amount,
      frequency,
      area,
      category,
      description,
      created_at::text
    FROM recurring_cash_flow
    ORDER BY created_at DESC
  `
  return rows as RecurringCashFlow[]
}

export async function createRecurringCashFlow(data: {
  type: TransactionType
  amount: number
  frequency: RecurringFrequency
  area?: string | null
  category: string
  description?: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.amount || data.amount <= 0) return { error: 'Neplatná částka' }
    if (!data.category?.trim()) return { error: 'Kategorie je povinná' }

    await sql`
      INSERT INTO recurring_cash_flow (type, amount, frequency, area, category, description)
      VALUES (
        ${data.type},
        ${data.amount},
        ${data.frequency},
        ${data.area || null},
        ${data.category},
        ${data.description?.trim() || null}
      )
    `

    revalidatePath('/hub/finance')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit opakovanou transakci' }
  }
}

export async function deleteRecurringCashFlow(id: string): Promise<void> {
  await requireAuth()
  // CASCADE na source_recurring_cash_flow_id → smaže všechny generované transakce
  await sql`DELETE FROM recurring_cash_flow WHERE id = ${id}`
  revalidatePath('/hub/finance')
}

// Generuje chybějící opakované cash-flow transakce pro aktuální měsíc/rok.
// Idempotentní — bezpečné volat při každém načtení stránky.
export async function generateRecurringCashFlowTransactions(): Promise<void> {
  // Měsíční → jedna transakce na kalendářní měsíc (1. v měsíci)
  await sql`
    INSERT INTO finance_transactions
      (amount, type, category, note, area, date, user_id, source_recurring_cash_flow_id, recurring_period)
    SELECT
      r.amount::numeric,
      r.type,
      r.category,
      r.description,
      r.area,
      DATE_TRUNC('month', CURRENT_DATE)::date,
      NULL,
      r.id,
      TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    FROM recurring_cash_flow r
    WHERE r.frequency = 'monthly'
    ON CONFLICT (source_recurring_cash_flow_id, recurring_period) DO NOTHING
  `

  // Roční → jedna transakce na kalendářní rok (1. ledna)
  await sql`
    INSERT INTO finance_transactions
      (amount, type, category, note, area, date, user_id, source_recurring_cash_flow_id, recurring_period)
    SELECT
      r.amount::numeric,
      r.type,
      r.category,
      r.description,
      r.area,
      DATE_TRUNC('year', CURRENT_DATE)::date,
      NULL,
      r.id,
      TO_CHAR(CURRENT_DATE, 'YYYY')
    FROM recurring_cash_flow r
    WHERE r.frequency = 'annual'
    ON CONFLICT (source_recurring_cash_flow_id, recurring_period) DO NOTHING
  `
}

export async function getCosts(): Promise<Cost[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text,
      name,
      amount::float AS amount,
      cost_type,
      category,
      description,
      source_finance_transaction_id::text,
      created_at::text
    FROM costs
    WHERE TRUE
    ORDER BY cost_type, name
  `
  return rows as Cost[]
}

export async function createCost(data: {
  name: string
  amount: number
  cost_type: CostType
  category: string
  description?: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.name?.trim()) return { error: 'Název je povinný' }
    if (!data.amount || data.amount <= 0) return { error: 'Neplatná částka' }
    if (!data.cost_type) return { error: 'Typ nákladu je povinný' }

    await sql`
      INSERT INTO costs (name, amount, cost_type, category, description)
      VALUES (
        ${data.name.trim()},
        ${data.amount},
        ${data.cost_type},
        ${data.category},
        ${data.description?.trim() || null}
      )
    `

    revalidatePath('/hub/finance')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit náklad' }
  }
}

export async function deleteCost(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM costs WHERE id = ${id}`
  revalidatePath('/hub/finance')
}

// Generuje chybějící opakované cost transakce pro aktuální měsíc/rok.
// Idempotentní — bezpečné volat při každém načtení stránky.
export async function generateRecurringCostTransactions(): Promise<void> {
  await sql`
    INSERT INTO finance_transactions
      (amount, type, category, note, date, user_id, source_cost_id, recurring_period)
    SELECT
      c.amount::numeric,
      'expense',
      'fixní náklady',
      c.name,
      DATE_TRUNC('month', CURRENT_DATE)::date,
      NULL,
      c.id,
      TO_CHAR(CURRENT_DATE, 'YYYY-MM')
    FROM costs c
    WHERE c.cost_type = 'fixed_monthly'
    ON CONFLICT (source_cost_id, recurring_period) DO NOTHING
  `

  await sql`
    INSERT INTO finance_transactions
      (amount, type, category, note, date, user_id, source_cost_id, recurring_period)
    SELECT
      c.amount::numeric,
      'expense',
      'fixní náklady',
      c.name,
      DATE_TRUNC('year', CURRENT_DATE)::date,
      NULL,
      c.id,
      TO_CHAR(CURRENT_DATE, 'YYYY')
    FROM costs c
    WHERE c.cost_type = 'fixed_annual'
    ON CONFLICT (source_cost_id, recurring_period) DO NOTHING
  `
}
