import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let db: PGlite

// `lib/db.ts` jede na Neonu; tag se přesměruje na PGlite, aby `issueInvoice`
// pouštělo tentýž SQL jako v produkci (vzor z admin-fakturace).
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import { adminDb, setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'
import { invoicePaymentsSql, remainingSql, remainingToPay } from '@/lib/admin/project-payments'
import { cancelInvoiceQuery, issueInvoice } from '@/lib/admin/invoice-issue'
import type { IssueInvoiceInput, IssuerProfile } from '@/lib/admin/invoice-issue-schema'
import { invoiceSyncQueries, syncInvoiceTransaction } from '@/lib/invoices'
import { ledgerSql } from '@/lib/admin/ledger'
import { setPortalDriverForTests, type PortalRow } from '@/lib/portal/db'
import {
  loadArchivedInvoicePdf,
  loadClientInvoiceDoc,
  loadClientMoney,
  pdfInvoiceFromRow,
} from '@/lib/portal/money'

// KP13 (R-121, R-125, D-K15): peníze a faktury v klientském prostoru. Migrace
// 122 dvakrát po sobě nad PGlite, faktury se vystavují a platí skutečnými
// funkcemi adminu, klient čte jako role portal_app. Čísla klienta se musí
// shodovat s adminem (`remainingSql`) na korunu.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const PX = 'cccccccc-0000-4000-8000-0000000000c1' // zakázka bez klienta

// Platný IBAN (kontrolní součet mod 97 sedí), jen pro test.
const IBAN = 'CZ6508000000192000145399'

const ISSUER: IssuerProfile = {
  name: 'Dodavatel Test',
  address: 'Ulice 1, Město',
  ico: '12345678',
  dic: '',
  bank: IBAN,
  email: 'tajny-dodavatel@example.cz',
  vatPayer: false,
}

async function asClient<T = Record<string, unknown>>(clientId: string | null, sqlText: string, params: unknown[] = []) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE portal_app')
    await db.query("SELECT set_config('app.client_id', $1, true)", [clientId ?? ''])
    const res = await db.query<T>(sqlText, params)
    await db.exec('COMMIT')
    return res.rows
  } catch (err) {
    await db.exec('ROLLBACK')
    throw err
  }
}

/** Co admin ukáže jako „zbývá doplatit" — zaplacená zakázka nezbývá nic. */
async function adminRemaining(projectId: string): Promise<number> {
  const res = await db.query<{ remaining: number }>(
    `SELECT (CASE WHEN p.paid THEN 0 ELSE ${remainingSql('p')} END)::float AS remaining FROM projects p WHERE p.id = $1`,
    [projectId],
  )
  return Number(res.rows[0].remaining)
}

async function portalMoney(projectId: string) {
  const res = await db.query<{ price: string | null; paid: string; remaining: string }>(
    'SELECT price, paid, remaining FROM portal.project_money WHERE project_id = $1',
    [projectId],
  )
  const r = res.rows[0]
  return r ? { price: r.price === null ? null : Number(r.price), paid: Number(r.paid), remaining: Number(r.remaining) } : null
}

/** Klient vidí totéž co admin: zbývá stejně, zaplaceno = cena − zbývá. */
async function expectSameAsAdmin(projectId: string) {
  const portal = await portalMoney(projectId)
  const remaining = await adminRemaining(projectId)
  const price = Number((await db.query<{ price: string | null }>('SELECT price FROM projects WHERE id = $1', [projectId])).rows[0].price ?? 0)
  expect(portal).not.toBeNull()
  expect(portal!.remaining).toBeCloseTo(remaining, 2)
  expect(portal!.paid).toBeCloseTo(price > 0 ? price - remaining : 0, 2)
  return portal!
}

const issueInput = (over: Partial<IssueInvoiceInput>): IssueInvoiceInput => ({
  projectId: PA,
  counterparty: { name: 'Firma A s.r.o.', address: 'Náměstí 2, Praha', ico: '87654321', dic: '' },
  issuedOn: '2026-11-01',
  suppliedOn: '',
  dueOn: '2026-11-15',
  currency: 'CZK',
  items: [{ description: 'Web', quantity: 1, unitPrice: 12000, vatRate: 0 }],
  note: 'Děkuji za spolupráci.',
  ...over,
})

async function payInvoice(id: string, day: string) {
  await db.query('UPDATE invoices SET paid_on = $2 WHERE id = $1', [id, day])
  await syncInvoiceTransaction(id)
}

let issuedId = ''
let eurId = ''
let archivedId = ''

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, paid boolean NOT NULL DEFAULT false,
      deposit_amount numeric, deposit_paid boolean NOT NULL DEFAULT false,
      invoiced_on_ico boolean NOT NULL DEFAULT false, notes text,
      public_token uuid DEFAULT gen_random_uuid(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, amount numeric NOT NULL,
      type text NOT NULL CHECK (type IN ('income', 'expense')), category text NOT NULL, note text, area text,
      date date NOT NULL, declared boolean NOT NULL DEFAULT false, deposit_transaction boolean NOT NULL DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL, source_cost_id uuid,
      source_recurring_cash_flow_id uuid, recurring_period text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE client_feedback (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      nps integer NOT NULL, content text, created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('migrations', '053_invoices.sql'))
  await db.exec('ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL')
  await db.exec(read('migrations', '092_client_requests.sql'))
  await db.exec(read('migrations', '093_project_activity.sql'))
  await db.exec(read('migrations', '107_fakturace_vystavovani.sql'))
  await db.exec(read('migrations', '117_faktury_koncepty.sql'))
  for (let i = 0; i < 2; i++) {
    await db.exec(read('migrations', '095_portal_schema.sql'))
    await db.exec(read('migrations', '096_portal_requests_messages.sql'))
    await db.exec(read('migrations', '113_portal_supabase_auth.sql'))
    await db.exec(read('migrations', '121_sluzby_a_etapy.sql'))
    await db.exec(read('migrations', '122_portal_penize_faktury.sql'))
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }

  await db.query(
    `INSERT INTO projects (id, client_name, description, status, price, notes, invoiced_on_ico, client_email) VALUES
      ($1, 'Firma A', 'Web A', 'in_progress', 20000, 'TAJNÁ POZNÁMKA A', true, 'a-tajny@example.cz'),
      ($2, 'Firma B', 'Web B', 'new', 9000, 'TAJNÁ POZNÁMKA B', false, NULL),
      ($3, 'Nikoho', NULL, 'new', 5000, NULL, false, NULL)`,
    [PA, PB, PX],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query(
    "INSERT INTO portal.members (id, client_id, clerk_user_id, email) VALUES ($1, $2, 'sa', 'a@example.cz'), ($3, $4, 'sb', 'b@example.cz')",
    [MA, A, MB, B],
  )
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])

  setAdminDbForTests(pgliteAdminDriver(db, { transactional: true }))
  setPortalDriverForTests({
    async transaction(queries) {
      await db.exec('BEGIN')
      try {
        await db.exec('SET LOCAL ROLE portal_app')
        const out: PortalRow[][] = []
        for (const q of queries) out.push((await db.query(q.text, [...q.params])).rows as PortalRow[])
        await db.exec('COMMIT')
        return out
      } catch (err) {
        await db.exec('ROLLBACK')
        throw err
      }
    },
  })
}, 90_000)

afterAll(async () => {
  setAdminDbForTests(null)
  setPortalDriverForTests(null)
  await db.close()
})

describe('sdílený výpočet (R-125)', () => {
  it('doplatek odečte i zaplacené faktury', () => {
    expect(remainingToPay({ price: 20000, depositAmount: 5000, depositPaid: true, extraDeposits: 3000, invoicePayments: 12000 })).toBe(0)
    expect(remainingToPay({ price: 20000, depositAmount: 5000, depositPaid: true, extraDeposits: 0, invoicePayments: 4000 })).toBe(11000)
    // Starší volání bez faktur se nemění.
    expect(remainingToPay({ price: 20000, depositAmount: 5000, depositPaid: true, extraDeposits: 3000 })).toBe(12000)
  })
})

describe('souhrn peněz se shoduje s adminem', () => {
  it('po propojení: nic nezaplaceno', async () => {
    const m = await expectSameAsAdmin(PA)
    expect(m).toEqual({ price: 20000, paid: 0, remaining: 20000 })
  })

  it('vlastní záloha a ruční záloha', async () => {
    await db.query('UPDATE projects SET deposit_amount = 5000, deposit_paid = true WHERE id = $1', [PA])
    expect((await expectSameAsAdmin(PA)).paid).toBe(5000)
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, date, source_project_id, deposit_transaction, declared)
       VALUES (3000, 'income', 'záloha', '2026-11-02', $1, true, true)`,
      [PA],
    )
    expect(await expectSameAsAdmin(PA)).toEqual({ price: 20000, paid: 8000, remaining: 12000 })
  })

  it('vystavená faktura se objeví, zaplacení ji odečte od zbývá', async () => {
    issuedId = (await issueInvoice(issueInput({}), ISSUER)).id
    const [row] = await db.query<{ kind: string; paid_on: string | null }>('SELECT kind, paid_on FROM portal.invoices WHERE id = $1', [issuedId]).then((r) => r.rows)
    expect(row).toEqual({ kind: 'issued', paid_on: null })
    expect((await expectSameAsAdmin(PA)).remaining).toBe(12000)

    await payInvoice(issuedId, '2026-11-10')
    expect(await expectSameAsAdmin(PA)).toEqual({ price: 20000, paid: 20000, remaining: 0 })
  })

  it('eurová faktura se do korun nepočítá, ale je v seznamu', async () => {
    eurId = (await issueInvoice(issueInput({ currency: 'EUR', items: [{ description: 'Hosting', quantity: 1, unitPrice: 500, vatRate: 0 }] }), ISSUER)).id
    await payInvoice(eurId, '2026-11-11')
    expect((await expectSameAsAdmin(PA)).paid).toBe(20000)
    const res = await db.query<{ currency: string }>('SELECT currency FROM portal.invoices WHERE id = $1', [eurId])
    expect(res.rows[0].currency).toBe('EUR')
  })

  it('storno vrátí peníze do zbývá a faktura je označená', async () => {
    // Jako `cancelIssuedInvoice` v adminu: storno a srovnání ledgeru jednou dávkou.
    await adminDb.batch([cancelInvoiceQuery(issuedId), ...invoiceSyncQueries(await ledgerSql(), issuedId)])
    const res = await db.query<{ cancelled_at: string | null; paid_on: string | null }>(
      'SELECT cancelled_at, paid_on FROM portal.invoices WHERE id = $1',
      [issuedId],
    )
    expect(res.rows[0].cancelled_at).not.toBeNull()
    expect(res.rows[0].paid_on).toBeNull()
    expect(await expectSameAsAdmin(PA)).toEqual({ price: 20000, paid: 8000, remaining: 12000 })
  })

  it('„Peníze dorazily" u zakázky = zaplaceno celé', async () => {
    await db.query('UPDATE projects SET paid = true WHERE id = $1', [PA])
    expect(await expectSameAsAdmin(PA)).toEqual({ price: 20000, paid: 20000, remaining: 0 })
    await db.query('UPDATE projects SET paid = false WHERE id = $1', [PA])
    expect((await expectSameAsAdmin(PA)).remaining).toBe(12000)
  })

  it('výpis zakázek v adminu počítá zaplacené faktury taky', async () => {
    const id = (await issueInvoice(issueInput({ items: [{ description: 'Doplatek', quantity: 1, unitPrice: 2000, vatRate: 0 }] }), ISSUER)).id
    await payInvoice(id, '2026-11-12')
    const res = await db.query<{ v: number }>(`SELECT ${invoicePaymentsSql('p')}::float AS v FROM projects p WHERE p.id = $1`, [PA])
    expect(Number(res.rows[0].v)).toBe(2000)
    expect(await expectSameAsAdmin(PA)).toEqual({ price: 20000, paid: 10000, remaining: 10000 })
  })
})

describe('co do portal nikdy nesmí', () => {
  it('koncept faktury, přijatá faktura ani faktura cizí zakázky', async () => {
    const before = Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM portal.invoices')).rows[0].n)
    await db.query(
      `INSERT INTO invoice_drafts (project_id, source, counterparty, items, currency)
       VALUES ($1, 'manual', '{"name":"Firma A"}'::jsonb, '[{"description":"Koncept","quantity":1,"unitPrice":999,"vatRate":0}]'::jsonb, 'CZK')`,
      [PA],
    )
    await db.query(
      `INSERT INTO invoices (invoice_number, project_id, issued_on, amount, direction) VALUES ('PRIJATA-1', $1, '2026-11-01', 100, 'received')`,
      [PA],
    )
    await db.query(`INSERT INTO invoices (invoice_number, project_id, issued_on, amount) VALUES ('X-1', $1, '2026-11-01', 100)`, [PX])
    const after = Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM portal.invoices')).rows[0].n)
    expect(after).toBe(before)
    expect((await db.query('SELECT 1 FROM portal.project_money WHERE project_id = $1', [PX])).rows).toHaveLength(0)
  })

  it('interní údaje: poznámka archivu, AI přepis, e-mail dodavatele, linie, poznámky zakázky', async () => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO invoices (invoice_number, project_id, issued_on, due_on, amount, note, ai_extracted, pdf_data, pdf_filename, client_email)
       VALUES ('FV/2025/7', $1, '2026-10-01', '2026-10-15', 1500, 'TAJNÁ POZNÁMKA K ARCHIVU', '{"tajne":"AI"}'::jsonb,
               decode('255044462d312e340a', 'hex'), '../../etc/passwd.pdf', 'odberatel@example.cz')
       RETURNING id::text AS id`,
      [PA],
    )
    archivedId = res.rows[0].id
    const dump = JSON.stringify((await db.query('SELECT * FROM portal.invoices')).rows)
      + JSON.stringify((await db.query('SELECT * FROM portal.project_money')).rows)
    for (const secret of ['TAJNÁ POZNÁMKA', 'tajne', 'tajny-dodavatel', 'odberatel@example.cz', 'a-tajny', 'passwd']) {
      expect(dump).not.toContain(secret)
    }
    const cols = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'portal' AND table_name IN ('invoices', 'project_money')`,
    )).rows.map((r) => r.column_name)
    for (const c of ['notes', 'invoiced_on_ico', 'declared', 'ai_extracted', 'pdf_data', 'client_email', 'finance_transaction_id']) {
      expect(cols).not.toContain(c)
    }
    // Poznámka *na faktuře* je vytištěná na dokladu, takže u vystavené faktury je.
    const printed = await db.query<{ printed_note: string | null }>('SELECT printed_note FROM portal.invoices WHERE id = $1', [issuedId])
    expect(printed.rows[0].printed_note).toBe('Děkuji za spolupráci.')
  })

  it('divný obsah položek neshodí zápis v adminu', async () => {
    await expect(
      db.query(
        `INSERT INTO invoices (invoice_number, number_seq, project_id, issued_on, amount, items, issuer, direction)
         VALUES ('2026999', 2026999, $1, '2026-11-01', 1, '[{"description":"A","quantity":"hodně","unitPrice":null}]'::jsonb,
                 '{"name":"X","address":"Y"}'::jsonb, 'issued')`,
        [PA],
      ),
    ).resolves.toBeDefined()
    const [row] = (await db.query('SELECT * FROM portal.invoices WHERE number = $1', ['2026999'])).rows as PortalRow[]
    expect(pdfInvoiceFromRow(row)).toBeNull()
    await db.query("DELETE FROM invoices WHERE invoice_number = '2026999'")
  })
})

describe('oddělení klientů (role portal_app)', () => {
  it('klient B nevidí peníze ani faktury klienta A', async () => {
    expect(await asClient(B, 'SELECT * FROM portal.project_money')).toHaveLength(0)
    expect(await asClient(B, 'SELECT * FROM portal.invoices')).toHaveLength(0)
    expect(await asClient(null, 'SELECT * FROM portal.invoices')).toHaveLength(0)
    expect((await asClient(A, 'SELECT * FROM portal.invoices')).length).toBeGreaterThan(0)
    expect(await asClient(A, 'SELECT * FROM portal.project_money')).toHaveLength(1)
  })

  it('portal_app nesáhne na faktury ani ledger v public', async () => {
    await expect(asClient(A, 'SELECT * FROM public.invoices')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'SELECT * FROM public.finance_transactions')).rejects.toThrow(/permission denied/)
    await expect(asClient(A, 'UPDATE portal.invoices SET amount = 0')).rejects.toThrow(/permission denied/)
  })

  it('lib/portal/money: klient A vidí svoje, klient B nic', async () => {
    const mine = await loadClientMoney(A, PA)
    expect(mine.money).toEqual({ price: 20000, paid: 10000, remaining: 10000, currency: 'CZK' })
    const theirs = await loadClientMoney(B, PA)
    expect(theirs).toEqual({ money: null, invoices: [] })
  })

  it('stav faktur, QR jen u nezaplacené v korunách s IBANem', async () => {
    const open = (await issueInvoice(issueInput({ dueOn: '2026-11-15', items: [{ description: 'Etapa 2', quantity: 1, unitPrice: 4000, vatRate: 0 }] }), ISSUER)).id
    const { invoices } = await loadClientMoney(A, PA)
    const byId = new Map(invoices.map((i) => [i.id, i]))
    expect(byId.get(issuedId)?.state).toBe('cancelled')
    expect(byId.get(issuedId)?.payment).toBeNull()
    expect(byId.get(eurId)?.state).toBe('paid')
    expect(byId.get(eurId)?.payment).toBeNull()
    const o = byId.get(open)!
    expect(['open', 'overdue']).toContain(o.state)
    expect(o.payment?.spayd).toBe(`SPD*1.0*ACC:${IBAN}*AM:4000.00*CC:CZK*X-VS:${o.number}`)
    expect(o.hasPdf).toBe(true)
    expect(byId.get(archivedId)).toMatchObject({ kind: 'archived', hasPdf: true, payment: null, state: 'overdue' })
  })

  it('PDF: vystavená z projekce, archivní jen přes funkci a jen pro člena', async () => {
    const doc = await loadClientInvoiceDoc(A, eurId)
    expect(doc?.kind).toBe('issued')
    expect(doc && doc.kind === 'issued' && doc.invoice.counterparty.name).toBe('Firma A s.r.o.')
    expect(await loadClientInvoiceDoc(B, eurId)).toBeNull()

    const arch = await loadClientInvoiceDoc(A, archivedId)
    expect(arch?.kind).toBe('archived')
    const pdf = await loadArchivedInvoicePdf(A, MA, archivedId)
    expect(pdf?.toString('latin1').startsWith('%PDF')).toBe(true)
    expect(await loadArchivedInvoicePdf(A, MB, archivedId)).toBeNull()
    expect(await loadArchivedInvoicePdf(B, MB, archivedId)).toBeNull()
    expect(await loadArchivedInvoicePdf(A, MA, eurId)).toBeNull()
  })

  it('ETag vystavené faktury se mění se zaplacením', async () => {
    const before = await loadClientInvoiceDoc(A, eurId)
    await db.query('UPDATE invoices SET paid_on = NULL WHERE id = $1', [eurId])
    await syncInvoiceTransaction(eurId)
    const after = await loadClientInvoiceDoc(A, eurId)
    expect(before?.etag).not.toBe(after?.etag)
    expect(after?.etag.startsWith('i-')).toBe(true)
  })
})

describe('propojení a rozpojení', () => {
  it('propojení doplní faktury a peníze, které vznikly dřív', async () => {
    await db.query(
      `INSERT INTO invoices (invoice_number, project_id, issued_on, amount, paid_on) VALUES ('B-ARCH-1', $1, '2026-09-01', 4000, '2026-09-10')`,
      [PB],
    )
    expect((await db.query('SELECT 1 FROM portal.invoices WHERE project_id = $1', [PB])).rows).toHaveLength(0)
    await db.query('SELECT portal.link_project($1, $2)', [B, PB])
    expect(await asClient(B, 'SELECT number FROM portal.invoices')).toEqual([{ number: 'B-ARCH-1' }])
    // Archivní faktura bez příjmu v ledgeru zbývá nesnižuje — stejně jako v adminu.
    expect(await expectSameAsAdmin(PB)).toEqual({ price: 9000, paid: 0, remaining: 9000 })
  })

  it('rozpojení smaže projekci', async () => {
    await db.query('SELECT portal.unlink_project($1)', [PB])
    expect((await db.query('SELECT 1 FROM portal.invoices WHERE project_id = $1', [PB])).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM portal.project_money WHERE project_id = $1', [PB])).rows).toHaveLength(0)
  })
})
