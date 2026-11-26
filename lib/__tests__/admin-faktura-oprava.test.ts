import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Oprava vystavené faktury (R-148) proti skutečnému Postgresu (PGlite).
 *
 * Co se slibuje: „Opravit" vystaví novou fakturu s dalším číslem a původní
 * v témže příkazu stornuje. Když jedno z toho nejde, nestane se ani druhé.
 * Zaplacenou ani stornovanou fakturu takhle opravit nejde a opravovaná
 * faktura se nepočítá do rozpisu zakázky, takže záloha 30 % jde opravit
 * třeba na 80 %.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite

vi.mock('@/lib/auth', () => ({
  getAdminSession: async () => ({ email: 'admin@example.cz' }),
  adminActorEmail: async () => 'admin@example.cz',
  requireAuth: async () => ({ user: { email: 'admin@example.cz' } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn(async () => {}) }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import {
  issueCorrection,
  loadCorrectionSource,
  resetIssuingReadyForTests,
  saveIssuerProfile,
} from '@/lib/admin/invoice-issue'
import { replacementNote, type IssuerProfile } from '@/lib/admin/invoice-issue-schema'
import { resetDraftsReadyForTests } from '@/lib/admin/invoice-drafts'
import { loadProjectBilling, resetKindsReadyForTests } from '@/lib/admin/project-billing'
import { issueNewInvoice } from '@/app/dashboard/finance/invoice-actions'
import { syncInvoiceTransaction } from '@/lib/invoices'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const ISSUER: IssuerProfile = {
  name: 'Kryštof Sobotka',
  address: 'Kamenice 64, 294 04 Dobšín',
  ico: '29977231',
  dic: '',
  bank: 'CZ6508000000192000145399',
  email: 'krystof@example.cz',
  vatPayer: false,
  tradeName: 'VIZEON',
  registry: 'Fyzická osoba zapsaná v živnostenském rejstříku',
  phone: '',
  web: 'vizeon.cz',
}

const COUNTERPARTY = { name: 'Kavárna U Mostu s.r.o.', address: 'Mostní 1, Praha', ico: '27074358', dic: '' }

async function project(price: number): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO projects (client_name, client_email, description, price, status)
     VALUES ('Kavárna U Mostu', 'kavarna@example.cz', 'Nový web', $1, 'in_progress') RETURNING id::text`,
    [price],
  )
  return res.rows[0].id
}

function form(projectId: string | null, kind: string, percent: number | null, over: { unitPrice?: number; note?: string } = {}) {
  return {
    kind,
    percent,
    projectId,
    counterparty: COUNTERPARTY,
    issuedOn: '2026-11-26',
    suppliedOn: '2026-11-26',
    dueOn: '2026-12-03',
    currency: 'CZK',
    items: [{ description: 'Nový web', quantity: 1, unitPrice: over.unitPrice ?? 1000, vatRate: 0 }],
    note: over.note ?? '',
  }
}

async function row(id: string) {
  const res = await db.query<{ invoice_number: string; amount: number; cancelled: boolean; paid: boolean; note: string | null; client_email: string | null }>(
    `SELECT invoice_number, amount::float AS amount, cancelled_at IS NOT NULL AS cancelled,
            paid_on IS NOT NULL AS paid, note, client_email
     FROM invoices WHERE id = $1`,
    [id],
  )
  return res.rows[0]
}

async function count(): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM invoices`)
  return res.rows[0].n
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      client_email text,
      description text,
      price numeric,
      deposit_amount numeric,
      deposit_paid boolean NOT NULL DEFAULT false,
      paid boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'new',
      project_type text NOT NULL DEFAULT 'client',
      contact_id uuid,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL,
      company text, ico text, dic text, merged_into uuid
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      amount numeric NOT NULL,
      type text NOT NULL,
      category text NOT NULL,
      note text,
      date date NOT NULL DEFAULT current_date,
      declared boolean NOT NULL DEFAULT false,
      source_project_id uuid,
      created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('053_invoices.sql'))
  await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)
  await db.exec(read('107_fakturace_vystavovani.sql'))
  await db.exec(read('117_faktury_koncepty.sql'))
  await db.exec(read('132_faktura_druh.sql'))

  setAdminDbForTests(pgliteAdminDriver(db))
  resetIssuingReadyForTests()
  resetDraftsReadyForTests()
  resetKindsReadyForTests()
  await saveIssuerProfile(ISSUER)
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

describe('oprava vystavené faktury', () => {
  it('záloha 30 % jde opravit na 80 %: nová faktura, stará stornovaná', async () => {
    const p = await project(100000)
    const first = await issueNewInvoice(form(p, 'deposit', 30), 'kavarna@example.cz')
    expect(first.error).toBeUndefined()
    expect((await row(first.id!)).amount).toBe(30000)

    // Bez opravy by 80 % neprošlo: vedle zálohy 30 % zbývá jen 70 %.
    const blocked = await issueNewInvoice(form(p, 'deposit', 80))
    expect(blocked.error).toMatch(/zbývá jen/)

    const fixed = await issueNewInvoice(form(p, 'deposit', 80), 'kavarna@example.cz', first.id)
    expect(fixed.error).toBeUndefined()
    expect(fixed.number).not.toBe(first.number)
    expect(await row(fixed.id!)).toMatchObject({ amount: 80000, cancelled: false, client_email: 'kavarna@example.cz' })
    expect((await row(first.id!)).cancelled).toBe(true)

    // Rozpis zakázky už zná jen opravenou fakturu.
    const billing = await loadProjectBilling(p)
    expect(billing?.invoices.map(i => i.number)).toEqual([fixed.number])
  })

  it('faktura bez zakázky: opravené položky a stará stornovaná', async () => {
    const first = await issueNewInvoice(form(null, 'single', null, { unitPrice: 5000 }))
    const fixed = await issueNewInvoice(form(null, 'single', null, { unitPrice: 4500 }), undefined, first.id)
    expect(fixed.error).toBeUndefined()
    expect((await row(fixed.id!)).amount).toBe(4500)
    expect((await row(first.id!)).cancelled).toBe(true)
  })

  it('zaplacenou fakturu takhle opravit nejde a nic nevznikne', async () => {
    const first = await issueNewInvoice(form(null, 'single', null, { unitPrice: 2000 }))
    await db.query(`UPDATE invoices SET paid_on = '2026-11-26' WHERE id = $1`, [first.id])
    await syncInvoiceTransaction(first.id!)
    const before = await count()

    const fixed = await issueNewInvoice(form(null, 'single', null, { unitPrice: 1500 }), undefined, first.id)
    expect(fixed.error).toMatch(/zaplatil nebo stornoval/)
    expect(await count()).toBe(before)
    expect(await row(first.id!)).toMatchObject({ cancelled: false, paid: true })
    expect(await loadCorrectionSource(first.id!)).toEqual({ ok: false, reason: 'paid' })
  })

  it('stornovanou fakturu podruhé neopraví', async () => {
    const first = await issueNewInvoice(form(null, 'single', null, { unitPrice: 3000 }))
    const once = await issueNewInvoice(form(null, 'single', null, { unitPrice: 3100 }), undefined, first.id)
    expect(once.error).toBeUndefined()
    const before = await count()

    const twice = await issueNewInvoice(form(null, 'single', null, { unitPrice: 3200 }), undefined, first.id)
    expect(twice.error).toMatch(/zaplatil nebo stornoval/)
    expect(await count()).toBe(before)
    expect(await loadCorrectionSource(first.id!)).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('když nová faktura neprojde databází, stará zůstane platná', async () => {
    const first = await issueNewInvoice(form(null, 'single', null, { unitPrice: 6000 }))
    const before = await count()
    await expect(
      issueCorrection(
        first.id!,
        { ...form(null, 'single', null), items: [] } as unknown as Parameters<typeof issueCorrection>[1],
        ISSUER,
      ),
    ).rejects.toThrow(/admin_invoice_items/)
    expect(await count()).toBe(before)
    expect((await row(first.id!)).cancelled).toBe(false)
  })

  it('archivní fakturu (nahrané PDF) neopravuje', async () => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO invoices (invoice_number, client_name, issued_on, amount, currency)
       VALUES ('FV-77', 'Cizí', '2026-11-01', 100, 'CZK') RETURNING id::text`,
    )
    expect(await loadCorrectionSource(res.rows[0].id)).toEqual({ ok: false, reason: 'missing' })
    const fixed = await issueNewInvoice(form(null, 'single', null), undefined, res.rows[0].id)
    expect(fixed.error).toMatch(/zaplatil nebo stornoval/)
  })

  it('formulář opravy dostane údaje původní faktury', async () => {
    const p = await project(50000)
    const first = await issueNewInvoice(form(p, 'deposit', 30, { note: 'Děkuji.' }), 'kavarna@example.cz')
    const source = await loadCorrectionSource(first.id!)
    expect(source.ok).toBe(true)
    if (!source.ok) return
    expect(source.source).toMatchObject({
      number: first.number,
      projectId: p,
      counterparty: COUNTERPARTY,
      email: 'kavarna@example.cz',
      dueOn: '2026-12-03',
      currency: 'CZK',
      note: 'Děkuji.',
      kind: 'deposit',
      percent: 30,
    })
    // Rozpis pro formulář opravy opravovanou fakturu nepočítá.
    expect((await loadProjectBilling(p, first.id!))?.invoices).toEqual([])
  })
})

describe('poznámka na opravené faktuře', () => {
  it('řekne, kterou fakturu nahrazuje', () => {
    expect(replacementNote('', '2026001')).toBe('Nahrazuje fakturu 2026001.')
    expect(replacementNote('Děkuji.', '2026001')).toBe('Děkuji. Nahrazuje fakturu 2026001.')
  })

  it('oprava opravy nemá dva odkazy', () => {
    expect(replacementNote('Děkuji. Nahrazuje fakturu 2026001.', '2026002')).toBe('Děkuji. Nahrazuje fakturu 2026002.')
  })
})
