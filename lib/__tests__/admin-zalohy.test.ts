import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Zálohy a jednorázové příjmy z Finance › Podnikání (R-110).
 *
 * K zakázce jde zapsat víc záloh. Zakázka si je odečte od doplatku všude,
 * kde ho počítá — hlavně když se označí „Peníze dorazily": doplatek nesmí
 * tytéž peníze zapsat podruhé.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({ getAdminSession: async () => ({ email: 'admin@example.cz' }), adminActorEmail: async () => 'admin@example.cz', requireAuth: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))
vi.mock('next/server', () => ({ after: (cb: () => unknown) => void cb() }))
vi.mock('@/lib/email', () => ({ sendBrandedEmail: async () => undefined }))
vi.mock('@/lib/notifications', () => ({ createNotification: async () => undefined }))
vi.mock('@/lib/invoices', () => ({ parseInvoiceForm: vi.fn(), insertInvoice: vi.fn() }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { resetLedgerCurrencyForTests } from '@/lib/admin/ledger'
import { loadBusinessPaymentsPanel, remainingToPay } from '@/lib/admin/project-payments'
import { addBusinessIncome, deleteBusinessIncome } from '@/app/dashboard/finance/business-income-actions'
import { getBusinessIncome } from '@/app/dashboard/finance/finance-actions'
import { updateProject } from '@/app/actions'
import { getPragueTodayISO } from '@/lib/prague-time'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const today = getPragueTodayISO()
const year = Number(today.slice(0, 4))

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(text, params)
  return res.rows
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      client_email text, client_phone text, service_type text, description text,
      focus text, project_url text, status text NOT NULL DEFAULT 'new',
      progress int NOT NULL DEFAULT 0, price numeric, paid boolean NOT NULL DEFAULT false,
      deadline date, notes text, estimated_costs numeric, deposit_amount numeric,
      deposit_paid boolean NOT NULL DEFAULT false, lead_origin text NOT NULL DEFAULT 'vizeon',
      lead_pending boolean NOT NULL DEFAULT false,
      invoiced_on_ico boolean NOT NULL DEFAULT false,
      public_token uuid NOT NULL DEFAULT gen_random_uuid(),
      updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now()
    );
    CREATE TABLE costs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL, amount numeric NOT NULL DEFAULT 0, cost_type text NOT NULL,
      category text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text, project_id uuid,
      currency text NOT NULL DEFAULT 'CZK', amount numeric, paid_on date,
      finance_transaction_id uuid, cancelled_at timestamptz
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid, amount numeric NOT NULL,
      type text NOT NULL CHECK (type IN ('income', 'expense')),
      category text NOT NULL, note text, area text, date date NOT NULL,
      declared boolean NOT NULL DEFAULT false,
      deposit_transaction boolean NOT NULL DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_cost_id uuid, source_invoice_id uuid, recurring_period text,
      created_at timestamptz DEFAULT now()
    );
  `)
  const migration = read('109_finance_meny_a_naklady.sql')
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
  await db.exec(`DELETE FROM finance_transactions; DELETE FROM invoices; DELETE FROM projects;`)
})

async function zakazka(over: { price?: number; paid?: boolean; declared?: boolean } = {}): Promise<string> {
  const [p] = await rows<{ id: string }>(
    `INSERT INTO projects (client_name, price, paid, status, invoiced_on_ico)
     VALUES ('Kavárna Ukázková', $1, $2, 'in_progress', $3) RETURNING id::text AS id`,
    [over.price ?? 20000, over.paid ?? false, over.declared ?? false],
  )
  return p.id
}

const zaloha = (projectId: string, amount: number) =>
  addBusinessIncome({ kind: 'zaloha', amount, date: today, projectId })

describe('výpočet doplatku', () => {
  it('odečte vlastní zálohu jen když dorazila a nikdy nejde pod nulu', () => {
    expect(remainingToPay({ price: 20000, depositAmount: 5000, depositPaid: true, extraDeposits: 3000 })).toBe(12000)
    expect(remainingToPay({ price: 20000, depositAmount: 5000, depositPaid: false, extraDeposits: 3000 })).toBe(17000)
    expect(remainingToPay({ price: 1000, depositAmount: null, depositPaid: false, extraDeposits: 1500 })).toBe(0)
  })
})

describe('zálohy k zakázce', () => {
  it('k jedné zakázce jde zapsat víc záloh a zbývající částka klesá', async () => {
    const id = await zakazka({ declared: true })
    expect((await zaloha(id, 5000)).ok).toBe(true)
    expect((await zaloha(id, 3000)).ok).toBe(true)

    const panel = await loadBusinessPaymentsPanel(year)
    expect(panel.projects.find((p) => p.id === id)?.remaining).toBe(12000)
    expect(panel.payments.filter((p) => p.kind === 'zaloha')).toHaveLength(2)

    // Linie se bere ze zakázky (fakturováno na IČO), ne z formuláře.
    const zapsane = await rows<{ declared: boolean; deposit_transaction: boolean; income_origin: string }>(
      `SELECT declared, deposit_transaction, income_origin FROM finance_transactions WHERE source_project_id = $1`,
      [id],
    )
    expect(zapsane.every((r) => r.declared && r.deposit_transaction && r.income_origin === 'manual')).toBe(true)
  })

  it('záloha vyšší než zbývá se neuloží', async () => {
    const id = await zakazka({ price: 10000 })
    await zaloha(id, 8000)
    const result = await zaloha(id, 2500)
    expect(result.ok).toBe(false)
    const [n] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`)
    expect(n.n).toBe(1)
  })

  it('k zaplacené zakázce zálohu zapsat nejde', async () => {
    const id = await zakazka({ paid: true })
    expect((await zaloha(id, 1000)).ok).toBe(false)
  })

  it('záloha bez zakázky neprojde', async () => {
    const result = await addBusinessIncome({ kind: 'zaloha', amount: 1000, date: today, projectId: null })
    expect(result.ok).toBe(false)
  })

  it('„Peníze dorazily" zapíše jen zbytek po zálohách', async () => {
    const id = await zakazka({ price: 20000 })
    await zaloha(id, 5000)
    await zaloha(id, 5000)

    await updateProject(id, {
      client_name: 'Kavárna Ukázková', client_email: null, client_phone: null, service_type: null,
      description: null, focus: null, project_url: null, status: 'paid', progress: 100,
      price: 20000, paid: true, estimated_costs: null, deposit_amount: 4000, deposit_paid: true,
      invoiced_on_ico: false, deadline: null, notes: null,
    })

    const prijmy = await rows<{ amount: number; category: string; deposit_transaction: boolean }>(
      `SELECT amount::float AS amount, category, deposit_transaction FROM finance_transactions
       WHERE source_project_id = $1 ORDER BY amount`,
      [id],
    )
    // Dvě zálohy z Podnikání, vlastní záloha zakázky (nezablokovaná těmi
    // ručními) a doplatek 20 000 − 4 000 − 10 000 = 6 000.
    expect(prijmy.reduce((s, r) => s + r.amount, 0)).toBe(20000)
    expect(prijmy.filter((r) => r.category === 'záloha')).toHaveLength(2)
    expect(prijmy.find((r) => r.category === 'zakázka' && r.deposit_transaction)?.amount).toBe(4000)
    expect(prijmy.find((r) => !r.deposit_transaction)?.amount).toBe(6000)
  })

  it('když zálohy pokryjí celou cenu, doplatek nevznikne', async () => {
    const id = await zakazka({ price: 6000 })
    await zaloha(id, 6000)
    await updateProject(id, {
      client_name: 'Kavárna Ukázková', client_email: null, client_phone: null, service_type: null,
      description: null, focus: null, project_url: null, status: 'paid', progress: 100,
      price: 6000, paid: true, estimated_costs: null, deposit_amount: null, deposit_paid: false,
      invoiced_on_ico: false, deadline: null, notes: null,
    })
    const [n] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`)
    expect(n.n).toBe(1)
  })
})

describe('faktury a doplatek zakázky (audit 2026-11-24)', () => {
  const form = (over: { paid: boolean; price: number; invoiced_on_ico: boolean }) => ({
    client_name: 'Kavárna Ukázková', client_email: null, client_phone: null, service_type: null,
    description: null, focus: null, project_url: null, status: (over.paid ? 'paid' : 'in_progress') as 'paid' | 'in_progress',
    progress: over.paid ? 100 : 50, estimated_costs: null, deposit_amount: null, deposit_paid: false,
    deadline: null, notes: null, ...over,
  })

  /** Zaplacená faktura zakázky, jak ji zapíše `syncInvoiceTransaction` (krok 7). */
  async function paidInvoice(projectId: string, amount: number) {
    const [inv] = await rows<{ id: string }>(
      `INSERT INTO invoices (invoice_number, project_id, amount, paid_on) VALUES ('2026001', $1, $2, $3) RETURNING id::text AS id`,
      [projectId, amount, today],
    )
    const [t] = await rows<{ id: string }>(
      `INSERT INTO finance_transactions (amount, type, category, note, date, source_project_id, source_invoice_id, declared, income_origin)
       VALUES ($1, 'income', 'faktura', 'Faktura 2026001', $3, $2, $4, true, 'invoice') RETURNING id::text AS id`,
      [amount, projectId, today, inv.id],
    )
    await db.query(`UPDATE invoices SET finance_transaction_id = $1 WHERE id = $2`, [t.id, inv.id])
  }

  it('„Peníze dorazily" po zaplacené zálohové faktuře zapíše zbytek (#3)', async () => {
    const id = await zakazka({ price: 20000 })
    await paidInvoice(id, 8000)
    await updateProject(id, form({ paid: true, price: 20000, invoiced_on_ico: false }))

    const doplatek = await rows<{ amount: number; income_origin: string }>(
      `SELECT amount::float AS amount, income_origin FROM finance_transactions
       WHERE source_project_id = $1 AND category = 'zakázka'`,
      [id],
    )
    expect(doplatek).toEqual([{ amount: 12000, income_origin: 'project' }])
    const [sum] = await rows<{ s: number }>(`SELECT sum(amount)::float AS s FROM finance_transactions WHERE source_project_id = $1`, [id])
    expect(sum.s).toBe(20000)
  })

  it('vypnutí „Fakturováno na IČO" nechá příjem z faktury v přiznané linii (#5)', async () => {
    const id = await zakazka({ price: 20000, declared: true })
    await paidInvoice(id, 8000)
    await zaloha(id, 2000)
    await updateProject(id, form({ paid: false, price: 20000, invoiced_on_ico: false }))

    const linie = await rows<{ category: string; declared: boolean }>(
      `SELECT category, declared FROM finance_transactions WHERE source_project_id = $1 ORDER BY category`,
      [id],
    )
    expect(linie).toEqual([
      { category: 'faktura', declared: true },
      { category: 'záloha', declared: false },
    ])
  })
})

describe('Podnikání počítá se zálohami', () => {
  it('nezaplacené zakázky odečtou zálohy a linie ukáže, kolik byly zálohy', async () => {
    const id = await zakazka({ price: 20000 })
    await zaloha(id, 7000)
    const summary = await getBusinessIncome(year)
    expect(summary.undeclared.outstanding).toBe(13000)
    expect(summary.undeclared.deposits).toBe(7000)
    expect(summary.undeclared.income).toBe(7000)
  })
})

describe('jednorázový příjem', () => {
  it('uloží se do zvolené linie a jde smazat', async () => {
    const result = await addBusinessIncome({ kind: 'jednorazovy', amount: 1500, date: today, note: 'Konzultace', declared: true })
    expect(result.ok).toBe(true)
    const [row] = await rows<{ declared: boolean; category: string; area: string }>(
      `SELECT declared, category, area FROM finance_transactions`,
    )
    expect(row).toEqual({ declared: true, category: 'jednorázový příjem', area: 'byznys' })

    if (!result.ok) throw new Error('neuloženo')
    expect((await deleteBusinessIncome(result.id)).ok).toBe(true)
    const [n] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`)
    expect(n.n).toBe(0)
  })

  it('příjem zakázky se tudy smazat nedá', async () => {
    const id = await zakazka()
    const [t] = await rows<{ id: string }>(
      `INSERT INTO finance_transactions (amount, type, category, date, source_project_id, income_origin)
       VALUES (1000, 'income', 'zakázka', $1, $2, 'project') RETURNING id::text AS id`,
      [today, id],
    )
    expect((await deleteBusinessIncome(t.id)).ok).toBe(false)
  })

  it('nesmyslná částka neprojde', async () => {
    expect((await addBusinessIncome({ kind: 'jednorazovy', amount: -5, date: today })).ok).toBe(false)
    expect((await addBusinessIncome({ kind: 'jednorazovy', amount: 100, date: '15.11.2026' })).ok).toBe(false)
  })
})
