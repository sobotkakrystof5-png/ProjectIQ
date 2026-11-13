import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Náklady a jejich historie (AD13, migrace 109) proti skutečnému Postgresu.
 *
 * Dvě chyby, které to hlídá:
 *  1. `updateCost` končila `DELETE FROM finance_transactions WHERE source_cost_id`,
 *     takže **jakákoli** editace fixního nákladu smazala všechny jeho
 *     vygenerované měsíční výdaje. Historie tiše zmizela.
 *  2. Generátor znal jen `CURRENT_DATE`, takže vynechaný měsíc se už nikdy
 *     nedoplnil.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { resetLedgerCurrencyForTests } from '@/lib/admin/ledger'
import { createCost, deleteCost, getCosts, updateCost } from '@/app/costs-actions'
import type { CostCategory } from '@/lib/types'
import { generateRecurringCostTransactionsInternal } from '@/lib/recurring-transactions'
import { loadCostsScreen } from '@/lib/admin/costs'
import { parseTableParams } from '@/lib/admin-table'
import { COST_SORT } from '@/lib/admin/costs'
import { getPragueTodayISO } from '@/lib/prague-time'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const today = getPragueTodayISO()
const mesic = today.slice(0, 7)

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(text, params)
  return res.rows
}

const platba = (over: Partial<Parameters<typeof createCost>[0]> = {}) => ({
  name: 'Hosting',
  amount: 300,
  cost_type: 'fixed_monthly' as const,
  category: 'hosting' as CostCategory,
  description: null,
  project_id: null,
  ...over,
})

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE costs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      amount numeric NOT NULL DEFAULT 0,
      cost_type text NOT NULL,
      category text,
      description text,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_finance_transaction_id uuid,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text, currency text NOT NULL DEFAULT 'CZK',
      amount numeric, paid_on date, finance_transaction_id uuid
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      amount numeric NOT NULL,
      type text NOT NULL CHECK (type IN ('income', 'expense')),
      category text NOT NULL,
      note text,
      date date NOT NULL,
      declared boolean NOT NULL DEFAULT false,
      source_cost_id uuid REFERENCES costs(id) ON DELETE SET NULL,
      source_invoice_id uuid,
      recurring_period text,
      created_at timestamptz DEFAULT now(),
      UNIQUE (source_cost_id, recurring_period)
    );
  `)
  const migration = read('109_finance_meny_a_naklady.sql')
  await db.exec(migration)
  await db.exec(migration)

  setAdminDbForTests(pgliteAdminDriver(db))
  resetLedgerCurrencyForTests()
})

afterAll(async () => {
  setAdminDbForTests(null)
  resetLedgerCurrencyForTests()
  await db.close()
})

beforeEach(async () => {
  await db.exec(`DELETE FROM finance_transactions; DELETE FROM costs;`)
})

describe('nový náklad', () => {
  it('jednorázový náklad vznikne i se svým výdajem, dnešním pražským datem', async () => {
    const { id } = await createCost(platba({ cost_type: 'one_time', amount: 1200, name: 'Doména' }))
    const [tx] = await rows<{ amount: string; date: string; recurring_period: string | null }>(
      `SELECT amount, date::text, recurring_period FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect({ amount: Number(tx.amount), date: tx.date, perioda: tx.recurring_period }).toEqual({
      amount: 1200,
      date: today,
      perioda: null,
    })
  })

  it('fixní náklad si sám výdaj nezakládá — dělá to generátor', async () => {
    const { id } = await createCost(platba())
    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(count.n).toBe(0)
    const [cost] = await rows<{ starts_on: string }>(`SELECT starts_on::text FROM costs WHERE id = $1`, [id])
    expect(cost.starts_on).toBe(today)
  })
})

describe('úprava fixního nákladu nemaže historii', () => {
  async function hostingSHistorii() {
    const { id } = await createCost(platba())
    await db.query(`UPDATE costs SET starts_on = $2 WHERE id = $1`, [id, '2026-06-01'])
    await generateRecurringCostTransactionsInternal()
    return id
  }

  it('přejmenování přepíše popis, ale nechá všechny záznamy', async () => {
    const id = await hostingSHistorii()
    const [pred] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(pred.n).toBeGreaterThan(1)

    await updateCost(id, platba({ name: 'Hosting a doména' }))

    const po = await rows<{ note: string }>(
      `SELECT note FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(po).toHaveLength(pred.n)
    expect(new Set(po.map((r) => r.note))).toEqual(new Set(['Hosting a doména']))
  })

  it('nová částka platí od aktuální periody dál, zaplacené měsíce se nepřepisují', async () => {
    const id = await hostingSHistorii()
    await updateCost(id, platba({ amount: 450 }))

    const zaznamy = await rows<{ recurring_period: string; amount: string }>(
      `SELECT recurring_period, amount FROM finance_transactions WHERE source_cost_id = $1 ORDER BY recurring_period`,
      [id],
    )
    for (const z of zaznamy) {
      const ocekavano = z.recurring_period >= mesic ? 450 : 300
      expect(Number(z.amount)).toBe(ocekavano)
    }
    expect(zaznamy.some((z) => Number(z.amount) === 300)).toBe(true)
    expect(zaznamy.some((z) => Number(z.amount) === 450)).toBe(true)
  })

  it('jednorázový náklad má pořád jen jeden záznam', async () => {
    const { id } = await createCost(platba({ cost_type: 'one_time', amount: 500 }))
    await updateCost(id, platba({ cost_type: 'one_time', amount: 700 }))
    const zaznamy = await rows<{ amount: string }>(
      `SELECT amount FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(zaznamy.map((z) => Number(z.amount))).toEqual([700])
  })

  it('nulová částka u jednorázového nákladu výdaj odstraní, historii fixního ne', async () => {
    const id = await hostingSHistorii()
    const pocet = (await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    ))[0].n
    await updateCost(id, platba({ amount: 0 }))
    const [po] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(po.n).toBe(pocet)
  })
})

describe('smazání nákladu', () => {
  it('náklad s historií se jen ukončí a výdaje zůstanou', async () => {
    const { id } = await createCost(platba())
    await db.query(`UPDATE costs SET starts_on = $2 WHERE id = $1`, [id, '2026-07-01'])
    await generateRecurringCostTransactionsInternal()

    const vysledek = await deleteCost(id)
    expect(vysledek.archived).toBe(true)

    const [cost] = await rows<{ archived_at: string | null; ends_on: string | null }>(
      `SELECT archived_at::text, ends_on::text FROM costs WHERE id = $1`,
      [id],
    )
    expect(cost.archived_at).not.toBeNull()
    expect(cost.ends_on).toBe(today)

    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(count.n).toBeGreaterThan(0)
  })

  it('ukončený náklad zmizí z výpisů, ale negeneruje se dál', async () => {
    const { id } = await createCost(platba())
    await db.query(`UPDATE costs SET starts_on = $2 WHERE id = $1`, [id, '2026-07-01'])
    await generateRecurringCostTransactionsInternal()
    await deleteCost(id)

    expect(await getCosts()).toEqual([])
    const screen = await loadCostsScreen(
      parseTableParams({}, { allowed: COST_SORT, defaultSort: 'castka', pageSize: 50, tiebreak: 'c.created_at' }),
      'vse',
    )
    expect(screen.rows).toEqual([])
    expect(screen.totals.monthly).toBe(0)

    const pred = (await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`))[0].n
    await generateRecurringCostTransactionsInternal()
    const po = (await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`))[0].n
    expect(po).toBe(pred)
  })

  it('náklad bez historie se smaže celý i se svým výdajem', async () => {
    const { id } = await createCost(platba({ cost_type: 'one_time', amount: 900 }))
    const vysledek = await deleteCost(id)
    expect(vysledek.archived).toBe(false)

    const [cost] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM costs WHERE id = $1`, [id])
    const [tx] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect([cost.n, tx.n]).toEqual([0, 0])
  })
})

describe('zpětné doplnění opakovaných nákladů', () => {
  it('doplní i měsíce, které cron vynechal', async () => {
    const { id } = await createCost(platba())
    await db.query(`UPDATE costs SET starts_on = $2 WHERE id = $1`, [id, '2026-06-01'])

    await generateRecurringCostTransactionsInternal()
    const periody = (await rows<{ recurring_period: string }>(
      `SELECT recurring_period FROM finance_transactions WHERE source_cost_id = $1 ORDER BY 1`,
      [id],
    )).map((r) => r.recurring_period)

    expect(periody).toContain('2026-06')
    expect(periody).toContain('2026-07')
    expect(periody).toContain(mesic)
    // Žádná mezera: od začátku po dnešek každý měsíc právě jednou.
    expect(new Set(periody).size).toBe(periody.length)
  })

  it('opakované spuštění nic nezdvojí', async () => {
    const { id } = await createCost(platba())
    await db.query(`UPDATE costs SET starts_on = $2 WHERE id = $1`, [id, '2026-08-01'])
    await generateRecurringCostTransactionsInternal()
    const pred = (await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`))[0].n
    await generateRecurringCostTransactionsInternal()
    await generateRecurringCostTransactionsInternal()
    const po = (await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`))[0].n
    expect(po).toBe(pred)
  })

  it('náklad s nesmyslně starým začátkem nevyrobí tisíce řádků', async () => {
    const { id } = await createCost(platba({ name: 'Překlep' }))
    await db.query(`UPDATE costs SET starts_on = $2 WHERE id = $1`, [id, '1990-01-01'])
    await generateRecurringCostTransactionsInternal()
    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_cost_id = $1`,
      [id],
    )
    expect(count.n).toBeLessThanOrEqual(36)
  })

  it('ukončený náklad se po `ends_on` už negeneruje', async () => {
    const { id } = await createCost(platba({ cost_type: 'fixed_annual', amount: 2400, name: 'Pojištění' }))
    await db.query(`UPDATE costs SET starts_on = $2, ends_on = $3 WHERE id = $1`, [id, '2024-01-01', '2025-12-31'])
    await generateRecurringCostTransactionsInternal()
    const periody = (await rows<{ recurring_period: string }>(
      `SELECT recurring_period FROM finance_transactions WHERE source_cost_id = $1 ORDER BY 1`,
      [id],
    )).map((r) => r.recurring_period)
    expect(periody).toEqual(['2024', '2025'])
  })
})
