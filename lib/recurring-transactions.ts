import { sql } from '@/lib/db'
import { adminDb } from '@/lib/admin/db'
import { getPragueTodayISO } from '@/lib/prague-time'

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

/**
 * Doplní chybějící výdaje fixních nákladů — **i zpětně** (AD13).
 *
 * Od migrace 109 to dělá databázová funkce `generate_recurring_costs`:
 * projde periody od `starts_on` nákladu po dnešek (strop 36 měsíců) a
 * chybějící doplní. Dřív funkce znala jen `CURRENT_DATE`, takže vynechaný
 * měsíc — cron neproběhl, náklad se zadal později, editace smazala historii —
 * se už nikdy nedoplnil a v přehledech prostě chyběl.
 *
 * Idempotentní: drží to `UNIQUE (source_cost_id, recurring_period)`
 * z migrace 030, takže se smí pouštět opakovaně (cron i tlačítko).
 *
 * Dokud 109 nedoběhne, chová se to jako dřív (jen aktuální perioda).
 */
export async function generateRecurringCostTransactionsInternal(): Promise<void> {
  try {
    await adminDb.batch([
      { text: `SELECT public.generate_recurring_costs($1::date, 36)`, params: [getPragueTodayISO()] },
    ])
    return
  } catch (err) {
    // 42883 = funkce neexistuje → migrace 109 ještě neproběhla.
    const code = (err as { code?: string })?.code
    const message = err instanceof Error ? err.message : String(err)
    if (code !== '42883' && !/generate_recurring_costs/.test(message)) throw err
  }
  await generateCurrentPeriodOnly()
}

/** Záložní cesta pro databázi bez migrace 109: jen aktuální měsíc a rok. */
async function generateCurrentPeriodOnly(): Promise<void> {
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
