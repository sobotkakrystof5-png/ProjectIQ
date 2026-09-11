'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import {
  generateRecurringCashFlowTransactionsInternal,
  generateRecurringCostTransactionsInternal,
} from '@/lib/recurring-transactions'

export type TransactionType = 'income' | 'expense'
export type RecurringFrequency = 'monthly' | 'annual'

export interface FinanceTransaction {
  id: string
  amount: number
  type: TransactionType
  category: string
  note: string | null
  area: string | null
  date: string
  /** Příjem fakturovaný na IČO — vstupuje do daňového základu (migrace 054) */
  declared: boolean
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
      declared,
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

export interface MonthSummary {
  month: string
  prevMonth: string
  income: number
  expense: number
  net: number
  prevIncome: number
  prevExpense: number
  prevNet: number
}

// Skutečné příjmy/výdaje za daný měsíc a měsíc předchozí (vč. vygenerovaných opakovaných položek), pro porovnání meziměsíční změny.
export async function getMonthSummary(month: string): Promise<MonthSummary> {
  await requireAuth()

  const [y, m] = month.split('-').map(Number)
  const prevDate = new Date(y, m - 2, 1)
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const rows = await sql`
    SELECT
      to_char(date, 'YYYY-MM') AS month,
      type,
      SUM(amount)::float AS total
    FROM finance_transactions
    WHERE user_id IS NULL
      AND to_char(date, 'YYYY-MM') IN (${month}, ${prevMonth})
    GROUP BY 1, 2
  `

  let income = 0, expense = 0, prevIncome = 0, prevExpense = 0
  for (const row of rows as { month: string; type: TransactionType; total: number }[]) {
    const isCurrent = row.month === month
    if (row.type === 'income') {
      if (isCurrent) income = row.total
      else prevIncome = row.total
    } else {
      if (isCurrent) expense = row.total
      else prevExpense = row.total
    }
  }

  return {
    month,
    prevMonth,
    income,
    expense,
    net: income - expense,
    prevIncome,
    prevExpense,
    prevNet: prevIncome - prevExpense,
  }
}

export interface AllTimeSummary {
  income: number
  expense: number
  net: number
}

// Skutečné příjmy/výdaje úplně za celou dobu (bez ohledu na měsíc/rok) — pro "Celkově" pohled v Co kdyby analýze.
export async function getAllTimeSummary(): Promise<AllTimeSummary> {
  await requireAuth()

  const rows = await sql`
    SELECT type, SUM(amount)::float AS total
    FROM finance_transactions
    WHERE user_id IS NULL
    GROUP BY type
  `

  let income = 0, expense = 0
  for (const row of rows as { type: TransactionType; total: number }[]) {
    if (row.type === 'income') income = row.total
    else expense = row.total
  }

  return { income, expense, net: income - expense }
}

export type FinanceHealth = 'good' | 'warning' | 'bad'

export interface FinanceHealthOverview {
  income12m: number
  expense12m: number
  savings12m: number
  savingsRate: number
  health: FinanceHealth
  trend: MonthlyAggregate[]
}

export async function getFinanceHealthOverview(): Promise<FinanceHealthOverview> {
  await requireAuth()

  const [rows, trend] = await Promise.all([
    sql`
      SELECT
        type,
        SUM(amount)::float AS total
      FROM finance_transactions
      WHERE user_id IS NULL
        AND date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY type
    `,
    getMonthlyAggregates(),
  ])

  let income12m = 0
  let expense12m = 0
  for (const row of rows as { type: TransactionType; total: number }[]) {
    if (row.type === 'income') income12m = row.total
    else expense12m = row.total
  }

  const savings12m = income12m - expense12m
  const savingsRate = income12m > 0 ? (savings12m / income12m) * 100 : 0
  const health: FinanceHealth = savingsRate < 0 ? 'bad' : savingsRate >= 20 ? 'good' : 'warning'

  return { income12m, expense12m, savings12m, savingsRate, health, trend }
}

export async function createTransaction(data: {
  amount: number
  type: TransactionType
  category: string
  note?: string
  area?: string | null
  date: string
  /** Přiznaný příjem (fakturováno na IČO). U výdajů nedává smysl a ukládá se jako false. */
  declared?: boolean
}): Promise<{ error?: string }> {
  try {
    await requireAuth()

    if (!data.amount || data.amount <= 0) return { error: 'Neplatná částka' }
    if (!['income', 'expense'].includes(data.type)) return { error: 'Neplatný typ' }
    if (!data.category?.trim()) return { error: 'Kategorie je povinná' }
    if (!data.date) return { error: 'Datum je povinné' }

    const declared = data.type === 'income' && data.declared === true

    const rows = await sql`
      INSERT INTO finance_transactions (amount, type, category, note, area, date, user_id, declared)
      VALUES (
        ${data.amount},
        ${data.type},
        ${data.category},
        ${data.note?.trim() || null},
        ${data.area || null},
        ${data.date},
        NULL,
        ${declared}
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

/**
 * Přeřadí existující příjem mezi liniemi. Bez tohohle by se historická data
 * (která migrace 054 schválně nechala jako nepřiznaná) nedala označit vůbec.
 *
 * U příjmu ze zakázky je zdrojem pravdy checkbox „fakturováno na IČO" —
 * ruční přeřazení tady přežije jen do nejbližší úpravy té zakázky.
 */
export async function setTransactionDeclared(id: string, declared: boolean): Promise<void> {
  await requireAuth()
  await sql`
    UPDATE finance_transactions
    SET declared = ${declared}
    WHERE id = ${id} AND user_id IS NULL AND type = 'income'
  `
  revalidatePath('/hub/finance')
}

export async function deleteTransaction(id: string): Promise<void> {
  await requireAuth()
  // Smazat provázaný náklad — ať transakce vznikla z nákladu (jednorázový cost → transakce),
  // nebo z ní náklad vznikl (byznys výdaj → cost). Oba směry musí zmizet spolu, je to jeden celek.
  await sql`
    DELETE FROM costs
    WHERE source_finance_transaction_id = ${id}::uuid
       OR (cost_type = 'one_time' AND id = (SELECT source_cost_id FROM finance_transactions WHERE id = ${id}::uuid))
  `
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
  await requireAuth()
  await generateRecurringCashFlowTransactionsInternal()
}

// Generuje chybějící opakované cost transakce pro aktuální měsíc/rok.
// Idempotentní — bezpečné volat při každém načtení stránky.
export async function generateRecurringCostTransactions(): Promise<void> {
  await requireAuth()
  await generateRecurringCostTransactionsInternal()
}

// --- Podnikání: dvě linie příjmů (přiznané / nepřiznané) ---
//
// „Přiznané" = fakturováno na IČO, jde do daňového přiznání. Nemá to nic
// společného s DPH (neplátce). Linie visí na `finance_transactions.declared`,
// ne na existenci faktury — jinak by se nepřiznaný příjem nedal evidovat
// vůbec (viz migrace 054).
//
// Rok se bere podle `date`, tedy podle dne, kdy peníze dorazily. Daňová
// evidence jede na hotovostním principu, vystavení faktury tu nehraje roli.

export interface IncomeLine {
  income: number
  transactionCount: number
  /** Kolik různých zakázek se na příjmu podílelo (transakce bez zakázky se nepočítají) */
  projectCount: number
  /**
   * Nezaplacené zakázky téhle linie — očekávaný, ale zatím nedoručený příjem.
   * Napříč roky, ne za vybraný rok: dokud peníze nedorazí, nepatří žádnému.
   */
  outstanding: number
}

export interface BusinessIncomeSummary {
  year: number
  /** Roky, ve kterých nějaký příjem existuje (vždy včetně letošního) */
  availableYears: number[]
  declared: IncomeLine
  undeclared: IncomeLine
  /** Součet obou linií — musí sedět na celkový příjem za rok */
  total: number
}

const EMPTY_LINE: IncomeLine = { income: 0, transactionCount: 0, projectCount: 0, outstanding: 0 }

export async function getBusinessIncome(year: number): Promise<BusinessIncomeSummary> {
  await requireAuth()

  const [incomeRows, outstandingRows, yearRows] = await Promise.all([
    sql`
      SELECT
        declared,
        SUM(amount)::float AS income,
        COUNT(*)::int AS transaction_count,
        COUNT(DISTINCT COALESCE(source_project_id::text, source_completed_project_id::text))::int AS project_count
      FROM finance_transactions
      WHERE user_id IS NULL
        AND type = 'income'
        AND EXTRACT(YEAR FROM date) = ${year}
      GROUP BY declared
    `,
    // Zbývá doplatit = cena − už zaplacená záloha. Zakázky obou byznysů
    // dohromady: je to jedno IČO a jedno daňové přiznání.
    sql`
      SELECT
        invoiced_on_ico AS declared,
        SUM(GREATEST(price - CASE WHEN deposit_paid THEN COALESCE(deposit_amount, 0) ELSE 0 END, 0))::float AS outstanding
      FROM projects
      WHERE paid = false
        AND price IS NOT NULL
        AND price > 0
      GROUP BY invoiced_on_ico
    `,
    sql`
      SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year
      FROM finance_transactions
      WHERE user_id IS NULL AND type = 'income'
      ORDER BY year DESC
    `,
  ])

  const lines: Record<'true' | 'false', IncomeLine> = {
    true: { ...EMPTY_LINE },
    false: { ...EMPTY_LINE },
  }

  for (const row of incomeRows as { declared: boolean; income: number; transaction_count: number; project_count: number }[]) {
    const key = row.declared ? 'true' : 'false'
    lines[key].income = row.income
    lines[key].transactionCount = row.transaction_count
    lines[key].projectCount = row.project_count
  }

  for (const row of outstandingRows as { declared: boolean; outstanding: number }[]) {
    lines[row.declared ? 'true' : 'false'].outstanding = row.outstanding
  }

  const currentYear = new Date().getFullYear()
  const years = (yearRows as { year: number }[]).map(r => r.year)
  const availableYears = Array.from(new Set([currentYear, year, ...years])).sort((a, b) => b - a)

  return {
    year,
    availableYears,
    declared: lines.true,
    undeclared: lines.false,
    total: lines.true.income + lines.false.income,
  }
}
