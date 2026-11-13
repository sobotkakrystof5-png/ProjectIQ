import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Měna v ledgeru a atomické uložení faktury (AD13, migrace 109) proti
 * skutečnému Postgresu (PGlite).
 *
 * Co se tu hlídá:
 *  1. Eurová faktura nevloží do korunového součtu nepřepočtené číslo.
 *  2. Příjmy do daňového základu jsou **jen koruny**; cizí měna stojí vedle.
 *  3. Uložení faktury je jedna dávka — pád uprostřed nenechá doklad bez příjmu.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { setAdminDbForTests, type AdminDriver } from '@/lib/admin/db'
import { ledgerCurrencyState, ledgerSql, resetLedgerCurrencyForTests } from '@/lib/admin/ledger'
import { insertInvoice, syncInvoiceTransaction, invoiceSyncQueries, type InvoiceInput } from '@/lib/invoices'
import { getBusinessIncome } from '@/app/dashboard/finance/finance-actions'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const invoice = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  invoice_number: `F-${Math.random().toString(36).slice(2, 8)}`,
  project_id: null,
  client_name: 'Klient s.r.o.',
  client_ico: null,
  client_dic: null,
  issued_on: '2026-03-01',
  due_on: '2026-03-15',
  paid_on: '2026-03-10',
  amount: 1000,
  currency: 'CZK',
  note: null,
  ai_extracted: null,
  ...over,
})

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
      description text,
      price numeric,
      deposit_amount numeric,
      deposit_paid boolean NOT NULL DEFAULT false,
      paid boolean NOT NULL DEFAULT false,
      invoiced_on_ico boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE costs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      amount numeric NOT NULL DEFAULT 0,
      cost_type text NOT NULL,
      category text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      amount numeric NOT NULL,
      type text NOT NULL CHECK (type IN ('income', 'expense')),
      category text NOT NULL,
      note text,
      area text,
      date date NOT NULL,
      declared boolean NOT NULL DEFAULT false,
      deposit_transaction boolean NOT NULL DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_cost_id uuid,
      source_recurring_cash_flow_id uuid,
      recurring_period text,
      created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('053_invoices.sql'))
  await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)
  await db.exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;`)

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

describe('před migrací 109', () => {
  it('admin počítá dál a sám pozná, že sloupec ještě není', async () => {
    const { id } = await insertInvoice(invoice({ amount: 2500, currency: 'EUR' }), null)
    // Zápis se na stav zeptal, než něco uložil.
    expect(ledgerCurrencyState()).toBe(false)
    const [tx] = await rows<{ amount: string }>(
      `SELECT amount FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    // Dnešní (chybné) chování zůstává: bez migrace se měna nikam neuloží.
    expect(Number(tx.amount)).toBe(2500)

    const summary = await getBusinessIncome(2026)
    expect(summary.foreign).toEqual([])
    expect(summary.total).toBe(2500)
  })
})

describe('migrace 109', () => {
  beforeAll(async () => {
    const migration = read('109_finance_meny_a_naklady.sql')
    await db.exec(migration)
    // Idempotence: druhý běh nesmí spadnout ani nic změnit.
    await db.exec(migration)
    resetLedgerCurrencyForTests()
  })

  it('je vidět a transakce mají výchozí měnu CZK', async () => {
    await syncInvoiceTransaction('00000000-0000-0000-0000-000000000000')
    expect(ledgerCurrencyState()).toBe(true)
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, date) VALUES (100, 'income', 'zakázka', '2026-03-01')`,
    )
    const [row] = await rows<{ currency: string }>(`SELECT currency FROM finance_transactions LIMIT 1`)
    expect(row.currency).toBe('CZK')
  })

  it('neznámou měnu databáze odmítne', async () => {
    await expect(
      db.query(
        `INSERT INTO finance_transactions (amount, type, category, date, currency) VALUES (1, 'income', 'x', '2026-03-01', 'USD')`,
      ),
    ).rejects.toThrow()
  })

  it('zpětně doplní měnu transakcím, které založila faktura', async () => {
    // Stav „před migrací": transakce bez měny (tedy CZK) k eurové faktuře.
    const [inv] = await rows<{ id: string }>(
      `INSERT INTO invoices (invoice_number, issued_on, paid_on, amount, currency)
       VALUES ('EUR-1', '2026-02-01', '2026-02-05', 400, 'EUR') RETURNING id::text AS id`,
    )
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, date, source_invoice_id, declared, currency)
       VALUES (400, 'income', 'faktura', '2026-02-05', $1, true, 'CZK')`,
      [inv.id],
    )

    await db.exec(read('109_finance_meny_a_naklady.sql'))

    const [tx] = await rows<{ currency: string }>(
      `SELECT currency FROM finance_transactions WHERE source_invoice_id = $1`,
      [inv.id],
    )
    expect(tx.currency).toBe('EUR')
  })
})

describe('eurová faktura v ledgeru', () => {
  it('uloží příjem v eurech, ne v korunách', async () => {
    const { id } = await insertInvoice(invoice({ amount: 2500, currency: 'EUR' }), null)
    const [tx] = await rows<{ amount: string; currency: string; declared: boolean }>(
      `SELECT amount, currency, declared FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    expect({ amount: Number(tx.amount), currency: tx.currency, declared: tx.declared }).toEqual({
      amount: 2500,
      currency: 'EUR',
      declared: true,
    })
  })

  it('se nesčítá s korunami ani v daňovém základu', async () => {
    await insertInvoice(invoice({ amount: 10000, currency: 'CZK', paid_on: '2026-04-02' }), null)
    await insertInvoice(invoice({ amount: 400, currency: 'EUR', paid_on: '2026-04-03' }), null)

    const summary = await getBusinessIncome(2026)

    // Do daní jdou jen koruny. 10 000 Kč, ne 10 400 „Kč".
    expect(summary.declared.income).toBe(10000)
    expect(summary.total).toBe(10000)
    expect(summary.foreign).toEqual([{ currency: 'EUR', amount: 400, count: 1 }])
  })

  it('nepřevezme korunový příjem zakázky, i když má stejné číslo', async () => {
    const [project] = await rows<{ id: string }>(
      `INSERT INTO projects (client_name, price, paid) VALUES ('Kavárna', 5000, true) RETURNING id::text AS id`,
    )
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, date, source_project_id, currency)
       VALUES (5000, 'income', 'zakázka', '2026-05-01', $1, 'CZK')`,
      [project.id],
    )

    const { id } = await insertInvoice(
      invoice({ amount: 5000, currency: 'EUR', project_id: project.id, paid_on: '2026-05-02' }),
      null,
    )

    const ledger = await rows<{ currency: string; source_invoice_id: string | null }>(
      `SELECT currency, source_invoice_id::text FROM finance_transactions WHERE source_project_id = $1 ORDER BY currency`,
      [project.id],
    )
    // Dvě různé měny = dvoje peníze. Faktura si musí založit vlastní řádek.
    expect(ledger.map((r) => r.currency)).toEqual(['CZK', 'EUR'])
    expect(ledger.find((r) => r.currency === 'EUR')?.source_invoice_id).toBe(id)
  })

  it('korunovou fakturu k zaplacené zakázce jen převezme, druhý příjem nevloží', async () => {
    const [project] = await rows<{ id: string }>(
      `INSERT INTO projects (client_name, price, paid) VALUES ('Zámečnictví', 7000, true) RETURNING id::text AS id`,
    )
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, date, source_project_id, currency)
       VALUES (7000, 'income', 'zakázka', '2026-06-01', $1, 'CZK')`,
      [project.id],
    )

    const { id } = await insertInvoice(
      invoice({ amount: 7000, currency: 'CZK', project_id: project.id, paid_on: '2026-06-02' }),
      null,
    )

    const ledger = await rows<{ id: string; declared: boolean }>(
      `SELECT id::text, declared FROM finance_transactions WHERE source_project_id = $1`,
      [project.id],
    )
    expect(ledger).toHaveLength(1)
    expect(ledger[0].declared).toBe(true)

    const [inv] = await rows<{ finance_transaction_id: string }>(
      `SELECT finance_transaction_id::text FROM invoices WHERE id = $1`,
      [id],
    )
    expect(inv.finance_transaction_id).toBe(ledger[0].id)
  })
})

describe('uložení faktury je jedna transakce', () => {
  it('doklad i jeho příjem jdou do databáze jednou dávkou', async () => {
    let calls = 0
    let longest = 0
    const counting: AdminDriver = {
      async transaction(queries) {
        calls++
        longest = Math.max(longest, queries.length)
        return pgliteAdminDriver(db).transaction(queries)
      },
    }
    setAdminDbForTests(counting)
    try {
      await insertInvoice(invoice({ amount: 1234 }), null)
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
    }

    // Jedno kolo do databáze, ne čtyři až šest (AD13).
    expect(calls).toBe(1)
    expect(longest).toBeGreaterThan(1)
  })

  it('pád uprostřed nenechá fakturu bez příjmu', async () => {
    setAdminDbForTests(pgliteAdminDriver(db, { transactional: true }))
    try {
      const { adminDb } = await import('@/lib/admin/db')
      const L = await ledgerSql()
      await expect(
        adminDb.batch([
          {
            text: `INSERT INTO invoices (invoice_number, issued_on, paid_on, amount, currency)
                   VALUES ('PAD-1', '2026-07-01', '2026-07-02', 900, 'CZK')`,
            params: [],
          },
          ...invoiceSyncQueries(L, '00000000-0000-0000-0000-000000000000'),
          { text: `SELECT 1 FROM tabulka_ktera_neexistuje`, params: [] },
        ]),
      ).rejects.toThrow()

      const zbylo = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE invoice_number = 'PAD-1'`)
      // Buď faktura i s příjmem, nebo nic. Nikdy zaplacená faktura bez peněz.
      expect(zbylo[0].n).toBe(0)
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
    }
  })

  it('opakovaný sync nic nezdvojí', async () => {
    const { id } = await insertInvoice(invoice({ amount: 3000 }), null)
    await syncInvoiceTransaction(id)
    await syncInvoiceTransaction(id)

    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    expect(count.n).toBe(1)
  })

  it('zrušené zaplacení příjem odstraní a vazbu rozváže', async () => {
    const { id } = await insertInvoice(invoice({ amount: 800 }), null)
    await db.query(`UPDATE invoices SET paid_on = NULL WHERE id = $1`, [id])
    await syncInvoiceTransaction(id)

    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    const [inv] = await rows<{ finance_transaction_id: string | null }>(
      `SELECT finance_transaction_id::text FROM invoices WHERE id = $1`,
      [id],
    )
    expect(count.n).toBe(0)
    expect(inv.finance_transaction_id).toBeNull()
  })
})
