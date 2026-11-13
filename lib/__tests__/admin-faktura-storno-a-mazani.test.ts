import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Dvě věci, které migrace 107 nechala otevřené (AD12, doplněk):
 *
 * 1. **Vystavený doklad se nemaže.** 107 uzavřela jeho *změnu*, ale archivní
 *    cestou (`deleteInvoice` ve Financích) šel smazat celý — a v číselné řadě
 *    by zůstala díra. Zavírá to migrace 108.
 * 2. **Storno není pohledávka.** Stornovaná faktura zůstává v evidenci kvůli
 *    souvislé řadě, ale nikdo ji nevymáhá: nesmí být mezi nezaplacenými,
 *    v součtech ani jedním klikem „Zaplaceno" (to by vrátilo příjem, který
 *    storno odebralo).
 */

const dbRef: { current: PGlite | null } = { current: null }

vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
    return (await dbRef.current!.query(text, values)).rows
  },
}))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { setAdminDbForTests } = await import('@/lib/admin/db')
const { pgliteAdminDriver } = await import('./helpers/admin-pglite')
const { loadInvoiceRegistry } = await import('@/lib/admin/invoices')
const { parseTableParams } = await import('@/lib/admin-table')
const { deleteInvoice, setInvoicePaid } = await import('@/app/dashboard/finance/invoice-actions')

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

const params = () =>
  parseTableParams({}, {
    allowed: { vystaveno: { sql: 'i.issued_on', dir: 'desc' as const } },
    defaultSort: 'vystaveno',
    pageSize: 50,
    tiebreak: 'i.created_at',
  })

async function jedno<T>(sql: string, args: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, args)).rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  dbRef.current = db
  await db.exec(`
    CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL);
    CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, description text, lead_origin text NOT NULL DEFAULT 'vizeon', created_at timestamptz DEFAULT now());
    CREATE TABLE finance_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL, type text NOT NULL, category text, note text, date date NOT NULL, user_id uuid, source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL, source_invoice_id uuid, declared boolean DEFAULT false);
    CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL, project_id uuid REFERENCES projects(id) ON DELETE SET NULL, client_name text, client_ico text, client_dic text, issued_on date NOT NULL, due_on date, paid_on date, amount numeric NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'CZK', note text, pdf_data bytea, pdf_filename text, pdf_size integer, ai_extracted jsonb, finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz);
    CREATE UNIQUE INDEX invoices_number_key ON invoices (invoice_number);
  `)
  await db.exec(fs.readFileSync(path.join(ROOT, 'migrations/107_fakturace_vystavovani.sql'), 'utf8'))
  const osmicka = fs.readFileSync(path.join(ROOT, 'migrations/108_faktura_se_nemaze.sql'), 'utf8')
  await db.exec(osmicka)
  // Běhoun smí migraci pustit znovu.
  await db.exec(osmicka)

  setAdminDbForTests(pgliteAdminDriver(db))

  await db.exec(`
    INSERT INTO invoices (invoice_number, number_seq, direction, pdf_generated, issued_on, due_on, amount, client_name, items, issuer, supplied_on)
    VALUES ('2026001', 2026001, 'issued', true, '2026-05-01', '2026-05-15', 12100, 'Vystavená faktura',
            '[{"description":"Web","quantity":1,"unitPrice":10000,"vatRate":21}]'::jsonb,
            '{"name":"Dodavatel","address":"Ulice 1","ico":"12345679","dic":"","bank":"","vatPayer":false}'::jsonb,
            '2026-05-01');
    INSERT INTO invoices (invoice_number, issued_on, due_on, amount, client_name)
    VALUES ('CIZI-1', '2026-05-02', '2026-05-16', 500, 'Archivní doklad');
  `)
})

afterAll(async () => {
  setAdminDbForTests(null)
  dbRef.current = null
  await db.close()
})

describe('vystavený doklad se nemaže (migrace 108)', () => {
  it('databáze smazání odmítne a admin to přeloží do češtiny', async () => {
    const { id } = await jedno<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)

    await expect(db.query(`DELETE FROM invoices WHERE id = $1`, [id])).rejects.toThrow(/admin_invoice_undeletable/)

    const vysledek = await deleteInvoice(id)
    expect(vysledek.error).toBe('Vystavenou fakturu nemažeme — číslo by v řadě chybělo. Použijte storno.')

    const { pocet } = await jedno<{ pocet: number }>(`SELECT count(*)::int AS pocet FROM invoices WHERE id = $1`, [id])
    expect(pocet).toBe(1)
  })

  it('archiv cizích PDF se maže dál', async () => {
    const { id } = await jedno<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = 'CIZI-1'`)
    expect(await deleteInvoice(id)).toEqual({})
    const { pocet } = await jedno<{ pocet: number }>(`SELECT count(*)::int AS pocet FROM invoices WHERE id = $1`, [id])
    expect(pocet).toBe(0)
  })
})

describe('storno není pohledávka', () => {
  it('zmizí z nezaplacených i ze součtů a objeví se ve vlastním filtru', async () => {
    const { id } = await jedno<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)

    const pred = await loadInvoiceRegistry(params(), { year: null, status: 'nezaplacene', query: '' })
    expect(pred.rows.map((f) => f.id)).toContain(id)

    await db.query(`UPDATE invoices SET cancelled_at = now() WHERE id = $1`, [id])

    const po = await loadInvoiceRegistry(params(), { year: null, status: 'nezaplacene', query: '' })
    expect(po.rows.map((f) => f.id)).not.toContain(id)
    expect(po.totals.reduce((sum, t) => sum + t.outstanding, 0)).toBe(0)

    const poSplatnosti = await loadInvoiceRegistry(params(), { year: null, status: 'po-splatnosti', query: '' })
    expect(poSplatnosti.rows.map((f) => f.id)).not.toContain(id)

    const storno = await loadInvoiceRegistry(params(), { year: null, status: 'storno', query: '' })
    expect(storno.rows.map((f) => f.id)).toEqual([id])
    expect(storno.rows[0].cancelled_at).not.toBeNull()
  })

  it('jedním klikem se zaplatit nedá', async () => {
    const { id } = await jedno<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)
    expect(await setInvoicePaid(id, '2026-05-20')).toEqual({ error: 'Stornovaná faktura se nedá označit jako zaplacená.' })

    const { paid_on } = await jedno<{ paid_on: string | null }>(`SELECT paid_on::text FROM invoices WHERE id = $1`, [id])
    expect(paid_on).toBeNull()
  })

  it('neexistující faktura má pořád svou hlášku', async () => {
    expect(await setInvoicePaid('11111111-1111-4111-8111-111111111111', null)).toEqual({ error: 'Faktura nenalezena' })
  })
})
