'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type TransactionType = 'income' | 'expense'

export interface FinanceTransaction {
  id: string
  amount: number
  type: TransactionType
  category: string
  note: string | null
  date: string
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
      date::text,
      created_at::text
    FROM finance_transactions
    WHERE user_id IS NULL
      AND to_char(date, 'YYYY-MM') = ${month}
    ORDER BY date DESC, created_at DESC
  `
  return rows as FinanceTransaction[]
}

export async function getMonthlyAggregates(): Promise<MonthlyAggregate[]> {
  await requireAuth()

  // Build last 6 months skeleton
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
  date: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()

    if (!data.amount || data.amount <= 0) return { error: 'Neplatná částka' }
    if (!['income', 'expense'].includes(data.type)) return { error: 'Neplatný typ' }
    if (!data.category?.trim()) return { error: 'Kategorie je povinná' }
    if (!data.date) return { error: 'Datum je povinné' }

    await sql`
      INSERT INTO finance_transactions (amount, type, category, note, date, user_id)
      VALUES (
        ${data.amount},
        ${data.type},
        ${data.category},
        ${data.note?.trim() || null},
        ${data.date},
        NULL
      )
    `

    revalidatePath('/hub/finance')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit transakci' }
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  await requireAuth()
  await sql`DELETE FROM finance_transactions WHERE id = ${id} AND user_id IS NULL`
  revalidatePath('/hub/finance')
}
