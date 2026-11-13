import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Jeden příjem v ledgeru právě jednou (AD13, migrace 109 sekce D).
 *
 * Dřív si faktura brala příjem zakázky sama — jen podle rovnosti částky
 * a první podle data. U zálohy a doplatku stejné výše mohla převzít ten
 * špatný; při zaokrouhlení nebo částečné platbě nepřevzala nic a vložila
 * druhý příjem, takže tytéž peníze ležely v ledgeru dvakrát a systém to
 * jen označil jako „zkontrolovat".
 *
 * Nově: automaticky se převezme jen jednoznačný kandidát, zbytek rozhodne
 * člověk („Je tohle ta platba?") a dvojí příjem **ze zakázky** hlídá
 * databáze indexem.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const MIGRACE = read('109_finance_meny_a_naklady.sql')

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
import { insertInvoice, type InvoiceInput } from '@/lib/invoices'
import {
  adoptPayment,
  getInvoiceDetail,
  getPaymentCandidates,
  keepPaymentsSeparate,
} from '@/app/dashboard/finance/invoice-actions'
import { resetIssuingReadyForTests } from '@/lib/admin/invoice-issue'
import { getPragueTodayISO } from '@/lib/prague-time'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const letos = getPragueTodayISO().slice(0, 4)

const SCHEMA = `
  CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name text NOT NULL,
    description text,
    client_phone text,
    client_email text,
    lead_origin text NOT NULL DEFAULT 'vizeon',
    price numeric,
    paid boolean NOT NULL DEFAULT false,
    deposit_amount numeric,
    deposit_paid boolean NOT NULL DEFAULT false,
    invoiced_on_ico boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE costs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL, amount numeric NOT NULL DEFAULT 0, cost_type text NOT NULL,
    category text, created_at timestamptz DEFAULT now()
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
`

const invoice = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  invoice_number: `F-${Math.random().toString(36).slice(2, 8)}`,
  project_id: null,
  client_name: 'Klient s.r.o.',
  client_ico: null,
  client_dic: null,
  issued_on: `${letos}-03-01`,
  due_on: `${letos}-03-15`,
  paid_on: `${letos}-03-10`,
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

/** Zakázka a její příjem(y) v ledgeru. */
async function zakazkaSPrijmy(castky: { amount: number; date: string; deposit?: boolean }[]) {
  const [project] = await rows<{ id: string }>(
    `INSERT INTO projects (client_name, price, paid) VALUES ('Kavárna Ukázková', 24000, true) RETURNING id::text AS id`,
  )
  for (const c of castky) {
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, note, date, source_project_id, deposit_transaction, income_origin)
       VALUES ($1, 'income', 'zakázka', 'Kavárna Ukázková', $2, $3, $4, 'project')`,
      [c.amount, c.date, project.id, c.deposit === true],
    )
  }
  return project.id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(read('053_invoices.sql'))
  await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)
  await db.exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;`)
  await db.exec(MIGRACE)
  await db.exec(MIGRACE)

  setAdminDbForTests(pgliteAdminDriver(db))
  resetLedgerCurrencyForTests()
  resetIssuingReadyForTests()
})

afterAll(async () => {
  setAdminDbForTests(null)
  resetLedgerCurrencyForTests()
  resetIssuingReadyForTests()
  await db.close()
})

beforeEach(async () => {
  await db.exec(`DELETE FROM finance_transactions; DELETE FROM invoices; DELETE FROM projects;`)
})

describe('databáze hlídá dvojí příjem', () => {
  it('zakázka nemůže mít dva doplatkové příjmy ze zakázky', async () => {
    const project = await zakazkaSPrijmy([{ amount: 24000, date: `${letos}-03-01` }])
    await expect(
      db.query(
        `INSERT INTO finance_transactions (amount, type, category, date, source_project_id, income_origin)
         VALUES (24000, 'income', 'zakázka', '${letos}-04-01', $1, 'project')`,
        [project],
      ),
    ).rejects.toThrow()
  })

  it('záloha a doplatek vedle sebe projdou', async () => {
    const project = await zakazkaSPrijmy([
      { amount: 8000, date: `${letos}-02-01`, deposit: true },
      { amount: 16000, date: `${letos}-03-01` },
    ])
    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_project_id = $1`,
      [project],
    )
    expect(count.n).toBe(2)
  })

  it('dvě faktury k téže zakázce mají každá svůj příjem — dílčí fakturace je v pořádku', async () => {
    const project = await zakazkaSPrijmy([])
    await insertInvoice(invoice({ project_id: project, amount: 10000, paid_on: `${letos}-03-10` }), null)
    await insertInvoice(invoice({ project_id: project, amount: 14000, paid_on: `${letos}-04-10` }), null)

    const ledger = await rows<{ amount: string }>(
      `SELECT amount FROM finance_transactions WHERE source_project_id = $1 ORDER BY amount`,
      [project],
    )
    expect(ledger.map((r) => Number(r.amount))).toEqual([10000, 14000])
  })

  it('jedna faktura nemůže mít dva příjmy', async () => {
    const [inv] = await rows<{ id: string }>(
      `INSERT INTO invoices (invoice_number, issued_on, paid_on, amount) VALUES ('X-1', '${letos}-05-01', '${letos}-05-02', 500)
       RETURNING id::text AS id`,
    )
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, date, source_invoice_id, income_origin)
       VALUES (500, 'income', 'faktura', '${letos}-05-02', $1, 'invoice')`,
      [inv.id],
    )
    await expect(
      db.query(
        `INSERT INTO finance_transactions (amount, type, category, date, source_invoice_id, income_origin)
         VALUES (500, 'income', 'faktura', '${letos}-05-03', $1, 'invoice')`,
        [inv.id],
      ),
    ).rejects.toThrow()
  })

  // Druhá databáze ve WASM: pustit celou migraci na datech s duplicitami
  // jinak nejde. Startuje pomalu, proto vlastní limit.
  it('migrace index přeskočí, když v datech duplicity jsou — a nespadne', async () => {
    const jina = new PGlite()
    try {
      await jina.exec(SCHEMA)
      await jina.exec(read('053_invoices.sql'))
      await jina.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid;`)
      const p = await jina.query<{ id: string }>(
        `INSERT INTO projects (client_name) VALUES ('Dvojitá') RETURNING id::text AS id`,
      )
      for (const den of ['2026-01-01', '2026-02-01']) {
        await jina.query(
          `INSERT INTO finance_transactions (amount, type, category, date, source_project_id)
           VALUES (1000, 'income', 'zakázka', $1, $2)`,
          [den, p.rows[0].id],
        )
      }

      // Nesmí spadnout: zbytek migrace je potřeba pustit.
      await jina.exec(MIGRACE)

      const index = await jina.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'finance_transactions_project_income_unique'`,
      )
      expect(index.rows[0].n).toBe(0)

      // Měna i náklady se přitom nastavily.
      const cur = await jina.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.columns
         WHERE table_name = 'finance_transactions' AND column_name = 'currency'`,
      )
      expect(cur.rows[0].n).toBe(1)
    } finally {
      await jina.close()
    }
  }, 60_000)
})

describe('„Je tohle ta platba?"', () => {
  it('dva stejně vysoké příjmy se nepřevezmou automaticky', async () => {
    const project = await zakazkaSPrijmy([
      { amount: 12000, date: `${letos}-02-01`, deposit: true },
      { amount: 12000, date: `${letos}-03-01` },
    ])
    const { id } = await insertInvoice(
      invoice({ project_id: project, amount: 12000, paid_on: `${letos}-03-10` }),
      null,
    )

    // Faktura si založila vlastní příjem — a nikomu nesebrala ten jeho.
    const [vlastni] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    expect(vlastni.n).toBe(1)

    const detail = await getInvoiceDetail(id)
    expect(detail?.duplicate_risk).toBe(true)

    const kandidati = await getPaymentCandidates(id)
    expect(kandidati).toHaveLength(2)
    expect(kandidati.every((k) => k.amount === 12000)).toBe(true)
  })

  it('jednoznačný kandidát se převezme sám, bez otázky', async () => {
    const project = await zakazkaSPrijmy([{ amount: 24000, date: `${letos}-03-01` }])
    const { id } = await insertInvoice(
      invoice({ project_id: project, amount: 24000, paid_on: `${letos}-03-10` }),
      null,
    )

    const ledger = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_project_id = $1`,
      [project],
    )
    expect(ledger[0].n).toBe(1)
    const [inv] = await rows<{ payment_origin: string | null }>(
      `SELECT payment_origin FROM invoices WHERE id = $1`,
      [id],
    )
    expect(inv.payment_origin).toBe('adopted')
  })

  it('převzetí vybrané platby zruší vlastní příjem faktury', async () => {
    const project = await zakazkaSPrijmy([
      { amount: 12000, date: `${letos}-02-01`, deposit: true },
      { amount: 12000, date: `${letos}-03-01` },
    ])
    const { id } = await insertInvoice(
      invoice({ project_id: project, amount: 12000, paid_on: `${letos}-03-10` }),
      null,
    )
    const kandidati = await getPaymentCandidates(id)
    const doplatek = kandidati.find((k) => !k.deposit)!

    expect(await adoptPayment(id, doplatek.id)).toEqual({})

    const ledger = await rows<{ id: string; declared: boolean }>(
      `SELECT id::text, declared FROM finance_transactions WHERE source_project_id = $1`,
      [project],
    )
    // Zůstaly dva příjmy zakázky, žádný třetí od faktury.
    expect(ledger).toHaveLength(2)

    const [inv] = await rows<{ finance_transaction_id: string; payment_origin: string; payment_reviewed_at: string | null }>(
      `SELECT finance_transaction_id::text, payment_origin, payment_reviewed_at::text FROM invoices WHERE id = $1`,
      [id],
    )
    expect(inv.finance_transaction_id).toBe(doplatek.id)
    expect(inv.payment_origin).toBe('adopted')
    expect(inv.payment_reviewed_at).not.toBeNull()

    const detail = await getInvoiceDetail(id)
    expect(detail?.duplicate_risk).toBe(false)
    expect(detail?.ledger?.owned_by_invoice).toBe(false)
  })

  it('platba z uzavřeného roku chce potvrzení — daňový základ loňska se nemění potichu', async () => {
    const lonskyRok = String(Number(letos) - 1)
    const project = await zakazkaSPrijmy([
      { amount: 5000, date: `${lonskyRok}-11-01` },
      { amount: 5000, date: `${lonskyRok}-12-01`, deposit: true },
    ])
    const { id } = await insertInvoice(
      invoice({ project_id: project, amount: 5000, paid_on: `${letos}-01-10` }),
      null,
    )
    const [kandidat] = await getPaymentCandidates(id)
    expect(kandidat.closedYear).toBe(true)

    expect(await adoptPayment(id, kandidat.id)).toEqual({ needsConfirm: lonskyRok })
    // Nic se nezměnilo.
    const [pred] = await rows<{ finance_transaction_id: string | null }>(
      `SELECT finance_transaction_id::text FROM invoices WHERE id = $1`,
      [id],
    )
    expect(pred.finance_transaction_id).not.toBe(kandidat.id)

    expect(await adoptPayment(id, kandidat.id, { confirmClosedYear: true })).toEqual({})
    const [po] = await rows<{ finance_transaction_id: string }>(
      `SELECT finance_transaction_id::text FROM invoices WHERE id = $1`,
      [id],
    )
    expect(po.finance_transaction_id).toBe(kandidat.id)
  })

  it('„byly to jiné peníze" nechá oba příjmy a varování zmizí', async () => {
    const project = await zakazkaSPrijmy([
      { amount: 12000, date: `${letos}-02-01`, deposit: true },
      { amount: 12000, date: `${letos}-03-01` },
    ])
    const { id } = await insertInvoice(
      invoice({ project_id: project, amount: 12000, paid_on: `${letos}-03-10` }),
      null,
    )

    expect(await keepPaymentsSeparate(id)).toEqual({})

    const [count] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_project_id = $1`,
      [project],
    )
    expect(count.n).toBe(3)

    const detail = await getInvoiceDetail(id)
    expect(detail?.duplicate_risk).toBe(false)
  })

  it('cizí platbu k faktuře přiřadit nejde', async () => {
    const project = await zakazkaSPrijmy([{ amount: 1000, date: `${letos}-03-01` }])
    const [jina] = await rows<{ id: string }>(
      `INSERT INTO projects (client_name) VALUES ('Někdo jiný') RETURNING id::text AS id`,
    )
    const [cizi] = await rows<{ id: string }>(
      `INSERT INTO finance_transactions (amount, type, category, date, source_project_id, income_origin)
       VALUES (1000, 'income', 'zakázka', '${letos}-03-05', $1, 'project') RETURNING id::text AS id`,
      [jina.id],
    )
    const { id } = await insertInvoice(
      invoice({ project_id: project, amount: 9999, paid_on: `${letos}-03-10` }),
      null,
    )

    const vysledek = await adoptPayment(id, cizi.id)
    expect(vysledek.error).toBeTruthy()
  })

  it('nesmyslné id se do databáze nedostane', async () => {
    expect((await adoptPayment('neco', 'jine')).error).toBe('Platba nenalezena')
    expect(await getPaymentCandidates('neco')).toEqual([])
    expect((await keepPaymentsSeparate('neco')).error).toBe('Faktura nenalezena')
  })
})
