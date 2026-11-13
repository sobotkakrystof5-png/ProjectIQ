'use server'

import { adminDb, q } from '@/lib/admin/db'
import { toForeignTotals, withLedger, type ForeignTotal } from '@/lib/admin/ledger'
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
  /** Příjmy v cizí měně — vedle korun, nikdy v nich (R-048, AD13). */
  foreign: ForeignTotal[]
}

// Skutečná výkonnost byznysu, vycházející z reálně zaznamenaných transakcí (žádné odhady/projekce):
// - Příjmy: zakázky (zálohy i doplatky), dokončené projekty a byznys příjmy + zálohy u uzavřených
//   zakázek, které vlastní finance_transactions řádek nemají.
//   Od AD11 se zálohy čtou ze zakázky (`completed_projects` byla její kopie). Podmínka
//   `NOT EXISTS … deposit_transaction` je tu nová a nutná: běžná zakázka svůj zálohový příjem
//   v transakcích má, takže bez ní by se záloha započítala dvakrát. Platí jen pro historii
//   doplněnou ručně, kterou migrace 106 převedla ze starých Dokončených.
// - Výdaje: reálné transakce tagované area='byznys' nebo napojené na náklad (`costs`), který NENÍ
//   označen jako 'personal' — takže osobní útraty (i když omylem uložené do `costs`) se nepočítají.
// annualFixedCosts zůstává projekcí (fixed_monthly*12 + fixed_annual, bez 'personal' nákladů) — používá
// se jen pro "co kdybych vydělal navíc" simulaci pokrytí fixních nákladů, ne pro reálné Výdaje.
export async function getBusinessOverview(): Promise<BusinessOverview> {
  await requireAuth()

  // Pět dotazů jedním požadavkem (AD06). Výkonnost se počítá v korunách;
  // cizí měna má vlastní řádek (AD13, migrace 109).
  const [incomeRows, depositRows, expenseRows, fixedCostRows, foreignRows] = await withLedger((L) =>
    adminDb.batch([
      {
        text: `
          SELECT COALESCE(SUM(amount), 0)::float AS total
          FROM finance_transactions
          WHERE user_id IS NULL AND type = 'income'
            AND ${L.czkOnly()}
            AND (area = 'byznys' OR category IN ('zakázka', 'dokončený projekt'))
        `,
        params: [],
      },
      q`
        SELECT COALESCE(SUM(p.deposit_amount), 0)::float AS total
        FROM projects p
        WHERE p.closed_at IS NOT NULL
          AND p.project_type = 'client'
          AND p.deposit_paid
          AND NOT EXISTS (
            SELECT 1 FROM finance_transactions t
            WHERE t.source_project_id = p.id AND t.deposit_transaction
          )
      `,
      {
        text: `
          SELECT COALESCE(SUM(ft.amount), 0)::float AS total
          FROM finance_transactions ft
          LEFT JOIN costs c ON c.id = ft.source_cost_id
          WHERE ft.user_id IS NULL AND ft.type = 'expense'
            AND ${L.czkOnly('ft')}
            AND (ft.area = 'byznys' OR (ft.source_cost_id IS NOT NULL AND COALESCE(c.category, 'all') <> 'personal'))
        `,
        params: [],
      },
      q`
        SELECT amount::float AS amount, cost_type
        FROM costs
        WHERE category IS DISTINCT FROM 'personal'
          AND cost_type IN ('fixed_monthly', 'fixed_annual')
      `,
      {
        text: `
          SELECT ${L.currency()} AS currency, COALESCE(SUM(amount), 0)::float AS amount, COUNT(*)::int AS count
          FROM finance_transactions
          WHERE user_id IS NULL AND type = 'income' AND NOT (${L.czkOnly()})
            AND (area = 'byznys' OR category IN ('zakázka', 'dokončený projekt', 'faktura'))
          GROUP BY 1
        `,
        params: [],
      },
    ]),
  )

  const income = (incomeRows[0] as { total: number }).total + (depositRows[0] as { total: number }).total
  const expenses = (expenseRows[0] as { total: number }).total

  const fixedCosts = fixedCostRows as { amount: number; cost_type: string }[]
  const fixedMonthly = fixedCosts.filter(c => c.cost_type === 'fixed_monthly').reduce((s, c) => s + c.amount, 0)
  const fixedAnnual = fixedCosts.filter(c => c.cost_type === 'fixed_annual').reduce((s, c) => s + c.amount, 0)
  const annualFixedCosts = fixedMonthly * 12 + fixedAnnual

  const profit = income - expenses
  const marginPct = income > 0 ? (profit / income) * 100 : 0

  return {
    income,
    expenses,
    profit,
    marginPct,
    annualFixedCosts,
    foreign: toForeignTotals((foreignRows ?? []) as { currency: unknown; amount: unknown; count: unknown }[]),
  }
}
