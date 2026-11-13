import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Datum příjmu ze zakázky (AD13, migrace 109 sekce E).
 *
 * Příjem se zapisoval s `now()::date` — tedy kdy to někdo naklikal, a navíc
 * v UTC. Peníze, které dorazily v prosinci a zapsaly se v lednu, tak spadly
 * do **jiného daňového roku**; po pražské půlnoci byl každý příjem o den
 * dřív. Od AD13 je datum platby na zakázce a prázdné znamená „dnes".
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => undefined }))
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
import { updateProject } from '@/app/actions'
import { getPragueTodayISO } from '@/lib/prague-time'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const today = getPragueTodayISO()

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(text, params)
  return res.rows
}

const payload = (over: Record<string, unknown> = {}) => ({
  client_name: 'Kavárna Ukázková',
  client_email: null,
  client_phone: null,
  service_type: null,
  description: null,
  focus: null,
  project_url: null,
  status: 'paid' as const,
  progress: 100,
  price: 24000,
  paid: true,
  estimated_costs: null,
  deposit_amount: null,
  deposit_paid: false,
  invoiced_on_ico: true,
  deadline: null,
  notes: null,
  ...over,
})

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
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text,
      currency text NOT NULL DEFAULT 'CZK', amount numeric, paid_on date,
      finance_transaction_id uuid, cancelled_at timestamptz
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid, amount numeric NOT NULL,
      type text NOT NULL CHECK (type IN ('income', 'expense')),
      category text NOT NULL, note text, date date NOT NULL,
      declared boolean NOT NULL DEFAULT false,
      deposit_transaction boolean NOT NULL DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_cost_id uuid, source_invoice_id uuid, recurring_period text,
      created_at timestamptz DEFAULT now()
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
  await db.exec(`DELETE FROM finance_transactions; DELETE FROM projects;`)
})

async function novaZakazka(): Promise<string> {
  const [p] = await rows<{ id: string }>(
    `INSERT INTO projects (client_name, price, status) VALUES ('Kavárna Ukázková', 24000, 'in_progress')
     RETURNING id::text AS id`,
  )
  return p.id
}

describe('příjem ze zakázky nese datum platby', () => {
  it('vyplněné datum rozhoduje o roku příjmu', async () => {
    const id = await novaZakazka()
    await updateProject(id, payload({ paid_on: '2025-12-28' }))

    const [tx] = await rows<{ date: string; income_origin: string; declared: boolean }>(
      `SELECT date::text, income_origin, declared FROM finance_transactions WHERE source_project_id = $1`,
      [id],
    )
    // Peníze z prosince zapsané v lednu patří do loňského přiznání.
    expect(tx.date).toBe('2025-12-28')
    expect(tx.income_origin).toBe('project')
    expect(tx.declared).toBe(true)
  })

  it('bez data se použije pražský dnešek, ne UTC', async () => {
    const id = await novaZakazka()
    await updateProject(id, payload())
    const [tx] = await rows<{ date: string }>(
      `SELECT date::text FROM finance_transactions WHERE source_project_id = $1`,
      [id],
    )
    expect(tx.date).toBe(today)
  })

  it('nesmyslné datum se nepřevezme a spadne na dnešek', async () => {
    const id = await novaZakazka()
    await updateProject(id, payload({ paid_on: '28.12.2025' }))
    const [tx] = await rows<{ date: string }>(
      `SELECT date::text FROM finance_transactions WHERE source_project_id = $1`,
      [id],
    )
    expect(tx.date).toBe(today)
  })

  it('záloha má vlastní datum a vedle doplatku obstojí', async () => {
    const id = await novaZakazka()
    await updateProject(
      id,
      payload({
        deposit_paid: true,
        deposit_amount: 8000,
        deposit_paid_on: '2026-02-03',
        paid_on: '2026-03-20',
      }),
    )

    const zaznamy = await rows<{ amount: string; date: string; deposit_transaction: boolean }>(
      `SELECT amount, date::text, deposit_transaction FROM finance_transactions
       WHERE source_project_id = $1 ORDER BY date`,
      [id],
    )
    expect(zaznamy.map((z) => [Number(z.amount), z.date, z.deposit_transaction])).toEqual([
      [8000, '2026-02-03', true],
      [16000, '2026-03-20', false],
    ])
  })

  it('datum platby se uloží na zakázku, aby ho formulář příště nabídl', async () => {
    const id = await novaZakazka()
    await updateProject(id, payload({ paid_on: '2026-04-05' }))
    const [p] = await rows<{ paid_on: string | null }>(`SELECT paid_on::text FROM projects WHERE id = $1`, [id])
    expect(p.paid_on).toBe('2026-04-05')
  })

  it('druhé uložení téže zaplacené zakázky příjem nezdvojí', async () => {
    const id = await novaZakazka()
    await updateProject(id, payload({ paid_on: '2026-04-05' }))
    await updateProject(id, payload({ paid_on: '2026-04-05' }))
    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_project_id = $1`,
      [id],
    )
    expect(count.n).toBe(1)
  })
})

describe('kód nikde nezapisuje příjem s datem v UTC', () => {
  it('`now()::date` u příjmů v app/actions.ts už není', () => {
    // Komentáře se nepočítají — vysvětlují právě tuhle opravu.
    const kod = fs
      .readFileSync(path.join(ROOT, 'app/actions.ts'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(kod).not.toContain('now()::date')
  })
})
