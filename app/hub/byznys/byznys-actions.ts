'use server'

import { sql } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export interface BusinessOverview {
  income: number
  expenses: number
  profit: number
  marginPct: number
  annualFixedCosts: number
}

// Skutečná výkonnost byznysu, vycházející z reálně zaznamenaných transakcí (žádné odhady/projekce):
// - Příjmy: zakázky (zálohy i doplatky), dokončené projekty a Hub byznys příjmy + zálohy u dokončených
//   projektů, které (zatím) nemají vlastní finance_transactions řádek.
// - Výdaje: reálné transakce tagované area='byznys' nebo napojené na náklad (`costs`), který NENÍ
//   označen jako 'personal' — takže osobní útraty (i když omylem uložené do `costs`) se nepočítají.
// annualFixedCosts zůstává projekcí (fixed_monthly*12 + fixed_annual, bez 'personal' nákladů) — používá
// se jen pro "co kdybych vydělal navíc" simulaci pokrytí fixních nákladů, ne pro reálné Výdaje.
export async function getBusinessOverview(): Promise<BusinessOverview> {
  await requireAuth()

  const [incomeRows, depositRows, expenseRows, fixedCostRows] = await Promise.all([
    sql`
      SELECT COALESCE(SUM(amount), 0)::float AS total
      FROM finance_transactions
      WHERE user_id IS NULL AND type = 'income'
        AND (area = 'byznys' OR category IN ('zakázka', 'dokončený projekt'))
    `,
    sql`
      SELECT COALESCE(SUM(deposit_amount), 0)::float AS total
      FROM completed_projects
      WHERE project_type = 'client'
    `,
    sql`
      SELECT COALESCE(SUM(ft.amount), 0)::float AS total
      FROM finance_transactions ft
      LEFT JOIN costs c ON c.id = ft.source_cost_id
      WHERE ft.user_id IS NULL AND ft.type = 'expense'
        AND (ft.area = 'byznys' OR (ft.source_cost_id IS NOT NULL AND COALESCE(c.category, 'all') <> 'personal'))
    `,
    sql`
      SELECT amount::float AS amount, cost_type
      FROM costs
      WHERE category IS DISTINCT FROM 'personal'
        AND cost_type IN ('fixed_monthly', 'fixed_annual')
    `,
  ])

  const income = (incomeRows[0] as { total: number }).total + (depositRows[0] as { total: number }).total
  const expenses = (expenseRows[0] as { total: number }).total

  const fixedCosts = fixedCostRows as { amount: number; cost_type: string }[]
  const fixedMonthly = fixedCosts.filter(c => c.cost_type === 'fixed_monthly').reduce((s, c) => s + c.amount, 0)
  const fixedAnnual = fixedCosts.filter(c => c.cost_type === 'fixed_annual').reduce((s, c) => s + c.amount, 0)
  const annualFixedCosts = fixedMonthly * 12 + fixedAnnual

  const profit = income - expenses
  const marginPct = income > 0 ? (profit / income) * 100 : 0

  return { income, expenses, profit, marginPct, annualFixedCosts }
}
