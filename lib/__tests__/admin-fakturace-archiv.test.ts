import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Archiv cizích PDF po migraci 107 (AD12).
 *
 * Migrace přidává na `invoices` trigger `BEFORE UPDATE`, kterým od teď
 * **projde každý zápis** — i ten z dnešního archivu. Tenhle test proto
 * pouští skutečný kód archivu (`lib/invoices.ts`) nad databází s migrací 107
 * a hlídá to jediné, na čem u peněz záleží: **jeden příjem vstupuje do
 * ledgeru právě jednou** (migrace 053 a 056).
 */

const dbRef: { current: PGlite | null } = { current: null }

vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
    const res = await dbRef.current!.query(text, values)
    return res.rows
  },
}))

const { insertInvoice, updateInvoiceRow, deleteInvoiceRow, syncInvoiceTransaction } = await import('@/lib/invoices')

const ROOT = path.resolve(__dirname, '../..')
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/107_fakturace_vystavovani.sql'), 'utf8')

let db: PGlite

const archiv = (overrides: Partial<Parameters<typeof insertInvoice>[0]> = {}) => ({
  invoice_number: 'FV-2026-1', project_id: null, client_name: 'Klient', client_ico: null, client_dic: null,
  issued_on: '2026-04-01', due_on: '2026-04-15', paid_on: null, amount: 12100, currency: 'CZK',
  note: null, ai_extracted: null, ...overrides,
})

async function prijmy() {
  const res = await db.query<{ pocet: number; soucet: string }>(
    `SELECT count(*)::int AS pocet, COALESCE(SUM(amount), 0)::text AS soucet
     FROM finance_transactions WHERE type = 'income' AND user_id IS NULL`,
  )
  return res.rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  dbRef.current = db
  await db.exec(`
    CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL);
    CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL, type text NOT NULL,
      category text, note text, date date NOT NULL, user_id uuid,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL, source_invoice_id uuid,
      declared boolean DEFAULT false
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      client_name text, client_ico text, client_dic text,
      issued_on date NOT NULL, due_on date, paid_on date,
      amount numeric NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'CZK', note text,
      pdf_data bytea, pdf_filename text, pdf_size integer, ai_extracted jsonb,
      finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(), updated_at timestamptz
    );
    CREATE UNIQUE INDEX invoices_number_key ON invoices (invoice_number);
  `)
  await db.exec(MIGRATION)
})

afterAll(async () => {
  dbRef.current = null
  await db.close()
})

describe('archiv faktur po migraci 107', () => {
  it('pohledávka nezaloží příjem, zaplacení ano a vrácení ho zase smaže', async () => {
    const { id } = await insertInvoice(archiv(), null)
    expect(await prijmy()).toMatchObject({ pocet: 0 })

    await updateInvoiceRow(id, archiv({ paid_on: '2026-04-20' }), null, false)
    expect(await prijmy()).toMatchObject({ pocet: 1, soucet: '12100' })

    await updateInvoiceRow(id, archiv({ paid_on: null }), null, false)
    expect(await prijmy()).toMatchObject({ pocet: 0 })

    await deleteInvoiceRow(id)
  })

  it('příjem, který už má zakázka, faktura převezme — nezaloží druhý', async () => {
    const project = (await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Zakázka') RETURNING id`)).rows[0].id
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, note, date, source_project_id)
       VALUES (9000, 'income', 'zakázka', 'Doplatek', '2026-04-10', $1)`, [project],
    )

    const { id } = await insertInvoice(archiv({ invoice_number: 'FV-2026-2', project_id: project, amount: 9000, paid_on: '2026-04-11' }), null)
    expect(await prijmy()).toMatchObject({ pocet: 1, soucet: '9000' })

    // Převzatý příjem patří zakázce — smazání faktury ho nechá být.
    await deleteInvoiceRow(id)
    expect(await prijmy()).toMatchObject({ pocet: 1, soucet: '9000' })
  })

  it('vlastní příjem faktury zmizí i se smazáním dokladu', async () => {
    const { id } = await insertInvoice(archiv({ invoice_number: 'FV-2026-3', amount: 500, paid_on: '2026-04-12' }), null)
    await syncInvoiceTransaction(id)
    const pred = await prijmy()
    await deleteInvoiceRow(id)
    expect(Number((await prijmy()).soucet)).toBe(Number(pred.soucet) - 500)
  })
})
