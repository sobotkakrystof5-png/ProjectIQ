import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Vystavování faktur v adminu (AD12) proti skutečnému Postgresu (PGlite).
 *
 * Testuje se to, co migrace 107 slibuje: číslo z řady se nikdy neopakuje
 * ani nevynechá, částku počítá databáze z položek, vystavený doklad už nejde
 * přepsat — a archiv cizích PDF se tím nemění.
 *
 * **Co PGlite neumí:** skutečný souběh. Je to jedno spojení ve WASM, takže
 * dvě současné transakce nejdou. Testuje se proto to, co souběh musí přežít:
 * `GREATEST` z uložené řady i z tabulky (ztracený zápis do nastavení) a
 * unikátní index na `number_seq` jako poslední pojistka pod zámkem.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

// `lib/db.ts` jede na Neonu; tady se jeho tag přesměruje na PGlite, aby
// `issueInvoice` a spol. pouštěly úplně tentýž SQL jako v produkci.
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import {
  cancelInvoice,
  isIssuingReady,
  issueInvoice,
  loadIssueDraft,
  loadIssuedInvoiceForPdf,
  loadIssuerProfile,
  resetIssuingReadyForTests,
  saveIssuerProfile,
} from '@/lib/admin/invoice-issue'
import type { IssuerProfile } from '@/lib/admin/invoice-issue-schema'
import { invoiceTotal } from '@/lib/invoice-pdf/totals'
import { syncInvoiceTransaction } from '@/lib/invoices'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const ISSUER: IssuerProfile = {
  name: 'Kryštof Sobotka',
  address: 'Kamenice 64, 294 04 Dobšín',
  ico: '29977231',
  dic: '',
  bank: 'CZ6508000000192000145399',
  email: 'info@example.cz',
  vatPayer: false,
}

const input = (over: Partial<Parameters<typeof issueInvoice>[0]> = {}) => ({
  projectId: null,
  counterparty: { name: 'Klient s.r.o.', address: 'Dlouhá 1, Praha', ico: '27074358', dic: '' },
  issuedOn: '2026-11-12',
  suppliedOn: '2026-11-12',
  dueOn: '2026-11-26',
  currency: 'CZK' as const,
  items: [{ description: 'Web na míru', quantity: 1, unitPrice: 25000, vatRate: 0 as const }],
  note: '',
  ...over,
})

async function count(table: string): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)
  return res.rows[0].n
}

beforeAll(async () => {
  db = new PGlite()
  // Tabulky tak, jak je nechaly migrace 001–106 — jen sloupce, kterých se
  // fakturace týká.
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      description text,
      price numeric,
      deposit_amount numeric,
      deposit_paid boolean NOT NULL DEFAULT false,
      contact_id uuid,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL,
      company text,
      ico text,
      dic text,
      merged_into uuid
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
      source_project_id uuid,
      created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('053_invoices.sql'))
  await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)

  const migration = read('107_fakturace_vystavovani.sql')
  await db.exec(migration)
  // Idempotence: druhý běh nesmí spadnout ani nic změnit.
  await db.exec(migration)

  setAdminDbForTests(pgliteAdminDriver(db))
  resetIssuingReadyForTests()
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

describe('migrace 107', () => {
  it('pozná, že je nasazená', async () => {
    expect(await isIssuingReady()).toBe(true)
  })

  it('archiv zůstal archivem a nové sloupce mají výchozí hodnoty', async () => {
    await db.query(
      `INSERT INTO invoices (invoice_number, issued_on, amount) VALUES ('cizi-2026-7', '2026-01-10', 1000)`,
    )
    const res = await db.query<{ direction: string; pdf_generated: boolean; number_seq: number | null }>(
      `SELECT direction, pdf_generated, number_seq FROM invoices WHERE invoice_number = 'cizi-2026-7'`,
    )
    expect(res.rows[0]).toEqual({ direction: 'issued', pdf_generated: false, number_seq: null })
  })

  it('přijatá faktura smí nést číslo dodavatele, i když se potká s vlastní řadou', async () => {
    await db.query(
      `INSERT INTO invoices (invoice_number, direction, issued_on, amount) VALUES ('2026001', 'received', '2026-02-01', 500)`,
    )
    await db.query(
      `INSERT INTO invoices (invoice_number, direction, issued_on, amount) VALUES ('2026001', 'received', '2026-02-02', 700)`,
    )
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM invoices WHERE direction = 'received' AND invoice_number = '2026001'`,
    )
    expect(res.rows[0].n).toBe(2)
  })

  it('dvě vystavené faktury se stejným číslem databáze nepustí', async () => {
    await expect(
      db.query(`INSERT INTO invoices (invoice_number, issued_on, amount) VALUES ('cizi-2026-7', '2026-03-01', 10)`),
    ).rejects.toThrow()
  })
})

describe('vystavení faktury', () => {
  it('přidělí číslo YYYYNNN a uloží doklad i se snímkem dodavatele', async () => {
    const { id, number } = await issueInvoice(input(), ISSUER)
    expect(number).toBe('2026001')

    const res = await db.query<{
      number_seq: number
      amount: string
      vat_total: string
      direction: string
      pdf_generated: boolean
      issuer: IssuerProfile
      items: { description: string }[]
      client_address: string
    }>(
      `SELECT number_seq, amount::text, vat_total::text, direction, pdf_generated, issuer, items, client_address
       FROM invoices WHERE id = $1`,
      [id],
    )
    const row = res.rows[0]
    expect(row.number_seq).toBe(2026001)
    expect(Number(row.amount)).toBe(25000)
    expect(Number(row.vat_total)).toBe(0)
    expect(row.direction).toBe('issued')
    expect(row.pdf_generated).toBe(true)
    expect(row.issuer.ico).toBe('29977231')
    expect(row.items[0].description).toBe('Web na míru')
    expect(row.client_address).toBe('Dlouhá 1, Praha')
  })

  it('vystavení samo o sobě nezakládá příjem — ten vzniká až zaplacením', async () => {
    expect(await count('finance_transactions')).toBe(0)
  })

  it('druhá faktura dostane další číslo', async () => {
    const { number } = await issueInvoice(input(), ISSUER)
    expect(number).toBe('2026002')
  })

  it('řada přežije ztracený zápis do nastavení — bere se i nejvyšší číslo z tabulky', async () => {
    await db.query(`UPDATE admin_settings SET invoice_sequences = '{}'::jsonb WHERE id = true`)
    const { number } = await issueInvoice(input(), ISSUER)
    expect(number).toBe('2026003')
  })

  it('každý rok má vlastní řadu', async () => {
    const { number } = await issueInvoice(input({ issuedOn: '2027-01-02', suppliedOn: '2027-01-02', dueOn: '2027-01-16' }), ISSUER)
    expect(number).toBe('2027001')
  })

  it('částku počítá databáze z položek a nesedící hodnotu odmítne', async () => {
    const res = await db.query<{ amount: string; vat_total: string }>(
      `SELECT amount::text, vat_total::text FROM invoices WHERE id = $1`,
      [
        (
          await issueInvoice(
            input({
              items: [
                { description: 'Práce', quantity: 3, unitPrice: 1200.5, vatRate: 21 },
                { description: 'Doména', quantity: 1, unitPrice: 350, vatRate: 21 },
              ],
            }),
            { ...ISSUER, vatPayer: true, dic: 'CZ29977231' },
          )
        ).id,
      ],
    )
    // 3 × 1200,50 = 3601,50 + DPH 756,32; 350 + DPH 73,50 → 4781,32 a DPH 829,82.
    // Zaokrouhluje se po položkách, v haléřích — a TypeScript musí dát totéž co SQL.
    expect(Number(res.rows[0].amount)).toBeCloseTo(4781.32, 2)
    expect(Number(res.rows[0].vat_total)).toBeCloseTo(829.82, 2)
    expect(
      invoiceTotal([
        { description: 'Práce', quantity: 3, unitPrice: 1200.5, vatRate: 21 },
        { description: 'Doména', quantity: 1, unitPrice: 350, vatRate: 21 },
      ]),
    ).toBeCloseTo(Number(res.rows[0].amount), 2)

    await expect(
      db.query(`SELECT admin_invoice_issue($1::jsonb)`, [
        JSON.stringify({
          issued_on: '2026-11-12',
          amount: 1,
          items: [{ description: 'X', quantity: 1, unitPrice: 100, vatRate: 0 }],
          issuer: ISSUER,
        }),
      ]),
    ).rejects.toThrow(/admin_invoice_amount_mismatch/)
  })

  it('faktura bez položek nebo s víc než padesáti neprojde', async () => {
    const many = Array.from({ length: 51 }, () => ({ description: 'X', quantity: 1, unitPrice: 1, vatRate: 0 }))
    for (const items of [[], many]) {
      await expect(
        db.query(`SELECT admin_invoice_issue($1::jsonb)`, [
          JSON.stringify({ issued_on: '2026-11-12', items, issuer: ISSUER }),
        ]),
      ).rejects.toThrow(/admin_invoice_items/)
    }
  })
})

describe('vystavený doklad je neměnný', () => {
  it('číslo, částku ani odběratele nepřepíše ani ruční UPDATE', async () => {
    const { id } = await issueInvoice(input(), ISSUER)
    for (const patch of [
      `invoice_number = '2026999'`,
      `amount = 1`,
      `client_name = 'Někdo jiný'`,
      `items = '[]'::jsonb`,
      `due_on = '2027-12-31'`,
    ]) {
      await expect(db.query(`UPDATE invoices SET ${patch} WHERE id = $1`, [id])).rejects.toThrow(/admin_invoice_locked/)
    }
  })

  it('zaplacení, poznámku, odeslání i storno měnit jde', async () => {
    const { id } = await issueInvoice(input(), ISSUER)
    await db.query(`UPDATE invoices SET paid_on = '2026-11-20', note = 'díky', sent_at = now() WHERE id = $1`, [id])
    await cancelInvoice(id)
    const res = await db.query<{ paid_on: string | null; cancelled_at: string | null }>(
      `SELECT paid_on::text, cancelled_at::text FROM invoices WHERE id = $1`,
      [id],
    )
    // Storno vrací i zaplacení — stornovaný doklad nesmí zůstat příjmem.
    expect(res.rows[0].paid_on).toBeNull()
    expect(res.rows[0].cancelled_at).not.toBeNull()
  })

  it('storno se nedá vzít zpět', async () => {
    const { id } = await issueInvoice(input(), ISSUER)
    await cancelInvoice(id)
    await expect(db.query(`UPDATE invoices SET cancelled_at = NULL WHERE id = $1`, [id])).rejects.toThrow(
      /admin_invoice_locked/,
    )
  })

  it('archivu cizích PDF se trigger netýká', async () => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO invoices (invoice_number, issued_on, amount) VALUES ('cizi-2026-99', '2026-05-05', 100) RETURNING id::text`,
    )
    await db.query(`UPDATE invoices SET amount = 250, invoice_number = 'cizi-2026-99b' WHERE id = $1`, [res.rows[0].id])
    const after = await db.query<{ amount: string }>(`SELECT amount::text FROM invoices WHERE id = $1`, [res.rows[0].id])
    expect(Number(after.rows[0].amount)).toBe(250)
  })
})

describe('profil dodavatele a předvyplnění', () => {
  it('profil se uloží a přečte zpátky', async () => {
    expect((await loadIssuerProfile()).configured).toBe(false)
    await saveIssuerProfile(ISSUER)
    const { profile, configured } = await loadIssuerProfile()
    expect(configured).toBe(true)
    expect(profile.bank).toBe('CZ6508000000192000145399')
  })

  it('ze zakázky předvyplní cenu bez zaplacené zálohy a odběratele z poslední faktury', async () => {
    const contact = await db.query<{ id: string }>(
      `INSERT INTO contacts (display_name, company, ico, dic) VALUES ('Jana Nová', 'Nová s.r.o.', '27074358', 'CZ27074358') RETURNING id::text`,
    )
    const project = await db.query<{ id: string }>(
      `INSERT INTO projects (client_name, description, price, deposit_amount, deposit_paid, contact_id)
       VALUES ('Jana Nová', 'E-shop', 60000, 20000, true, $1) RETURNING id::text`,
      [contact.rows[0].id],
    )
    const projectId = project.rows[0].id
    await issueInvoice(input({ projectId, counterparty: { name: 'Nová s.r.o.', address: 'Dlouhá 9', ico: '27074358', dic: 'CZ27074358' } }), ISSUER)

    const draft = await loadIssueDraft(projectId)
    expect(draft.amount).toBe(40000)
    expect(draft.counterparty.name).toBe('Nová s.r.o.')
    expect(draft.counterparty.address).toBe('Dlouhá 9')
    expect(draft.dueOn > draft.issuedOn).toBe(true)
    expect(draft.projectLabel).toBe('Jana Nová — E-shop')
  })

  it('bez zakázky nabídne jen data a prázdného odběratele', async () => {
    const draft = await loadIssueDraft(null)
    expect(draft.amount).toBe(0)
    expect(draft.counterparty.name).toBe('')
  })
})

describe('příjem vzniká až zaplacením (archiv se nemění)', () => {
  it('vystavená faktura založí po zaplacení právě jeden příjem a opakování nic nepřidá', async () => {
    const before = await count('finance_transactions')
    const { id } = await issueInvoice(input(), ISSUER)
    await db.query(`UPDATE invoices SET paid_on = '2026-11-20' WHERE id = $1`, [id])

    await syncInvoiceTransaction(id)
    await syncInvoiceTransaction(id)

    const res = await db.query<{ n: number; category: string; declared: boolean }>(
      `SELECT count(*)::int AS n, min(category) AS category, bool_and(declared) AS declared
       FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    expect(res.rows[0].n).toBe(1)
    expect(res.rows[0].category).toBe('faktura')
    expect(res.rows[0].declared).toBe(true)
    expect(await count('finance_transactions')).toBe(before + 1)
  })

  it('storno příjem zase odebere', async () => {
    const { id } = await issueInvoice(input(), ISSUER)
    await db.query(`UPDATE invoices SET paid_on = '2026-11-20' WHERE id = $1`, [id])
    await syncInvoiceTransaction(id)
    expect(await count(`finance_transactions WHERE source_invoice_id = '${id}'`)).toBe(1)

    await cancelInvoice(id)
    await syncInvoiceTransaction(id)
    expect(await count(`finance_transactions WHERE source_invoice_id = '${id}'`)).toBe(0)
  })

  it('příjem, který už zakázka měla, faktura převezme — nezaloží druhý', async () => {
    const project = await db.query<{ id: string }>(
      `INSERT INTO projects (client_name, price) VALUES ('Dvojí započtení', 25000) RETURNING id::text`,
    )
    const projectId = project.rows[0].id
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, note, date, source_project_id)
       VALUES (25000, 'income', 'zakázka', 'Zaplaceno předem', '2026-11-01', $1)`,
      [projectId],
    )
    const { id } = await issueInvoice(input({ projectId }), ISSUER)
    await db.query(`UPDATE invoices SET paid_on = '2026-11-20' WHERE id = $1`, [id])
    await syncInvoiceTransaction(id)

    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_project_id = $1 AND type = 'income'`,
      [projectId],
    )
    expect(res.rows[0].n).toBe(1)
  })

  it('archiv cizího PDF se chová přesně jako dřív', async () => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO invoices (invoice_number, issued_on, paid_on, amount)
       VALUES ('cizi-2026-500', '2026-07-01', '2026-07-10', 4200) RETURNING id::text`,
    )
    const id = res.rows[0].id
    await syncInvoiceTransaction(id)
    expect(await count(`finance_transactions WHERE source_invoice_id = '${id}'`)).toBe(1)

    // Zrušení zaplacení příjem, který faktura sama založila, zase smaže.
    await db.query(`UPDATE invoices SET paid_on = NULL WHERE id = $1`, [id])
    await syncInvoiceTransaction(id)
    expect(await count(`finance_transactions WHERE source_invoice_id = '${id}'`)).toBe(0)
  })
})

describe('podklad pro PDF', () => {
  it('nese snímek dodavatele, položky a pozná, že se faktura ještě platí', async () => {
    const { id, number } = await issueInvoice(input(), ISSUER)
    const loaded = await loadIssuedInvoiceForPdf(id)
    expect(loaded?.filename).toBe(`faktura-${number}.pdf`)
    expect(loaded?.invoice.issuer.name).toBe('Kryštof Sobotka')
    expect(loaded?.invoice.items).toHaveLength(1)
    expect(loaded?.invoice.payable).toBe(true)
    expect(loaded?.invoice.cancelled).toBe(false)
  })

  it('stornovaná faktura se neplatí a je označená', async () => {
    const { id } = await issueInvoice(input(), ISSUER)
    await cancelInvoice(id)
    const loaded = await loadIssuedInvoiceForPdf(id)
    expect(loaded?.invoice.payable).toBe(false)
    expect(loaded?.invoice.cancelled).toBe(true)
  })

  it('archiv cizích PDF tudy nechodí', async () => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO invoices (invoice_number, issued_on, amount) VALUES ('cizi-2026-123', '2026-06-06', 100) RETURNING id::text`,
    )
    expect(await loadIssuedInvoiceForPdf(res.rows[0].id)).toBeNull()
  })
})
