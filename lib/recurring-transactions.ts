import { sql } from '@/lib/db'

// Generuje chybějící opakované cash-flow transakce pro aktuální měsíc/rok.
// Idempotentní — bezpečné volat opakovaně (page load i cron).
export async function generateRecurringCashFlowTransactionsInternal(): Promise<void> {
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

// Generuje chybějící opakované cost transakce pro aktuální měsíc/rok.
// Idempotentní — bezpečné volat opakovaně (page load i cron).
export async function generateRecurringCostTransactionsInternal(): Promise<void> {
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
