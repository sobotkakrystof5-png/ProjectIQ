import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Fakturační údaje klienta na jednom místě (R-153, migrace 140) proti
 * skutečnému Postgresu (PGlite).
 *
 * Co se slibuje: e-mail a telefon odběratele jsou na faktuře a po vystavení
 * se nemění; kontakt má sídlo a formulář faktury ho bere; vystavená faktura
 * vrátí IČO, DIČ, sídlo a telefon do kontaktu (prázdné místo nebo stará
 * hodnota), e-mail jen na prázdné místo; úprava kontaktu se propíše do
 * nevystavených konceptů, ručně jiné hodnoty nechá být.
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
import { loadIssueDraft, loadIssuedInvoiceForPdf, resetIssuingReadyForTests, saveIssuerProfile } from '@/lib/admin/invoice-issue'
import type { IssuerProfile } from '@/lib/admin/invoice-issue-schema'
import { createDraft, getDraft, issueDraft, resetDraftsReadyForTests } from '@/lib/admin/invoice-drafts'
import { resetKindsReadyForTests } from '@/lib/admin/project-billing'
import { issueNewInvoice } from '@/app/dashboard/finance/invoice-actions'
import { saveContact } from '@/app/contacts-actions'
import { invoiceHtml } from '@/lib/invoice-pdf/render'
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
  registry: 'Fyzická osoba zapsaná v živnostenském rejstříku, Magistrát města Mladá Boleslav',
  phone: '',
  web: 'vizeon.cz',
}

type ContactSeed = { name?: string; company?: string; email?: string; phone?: string; ico?: string; dic?: string; address?: string }

async function seed(contact: ContactSeed, project: { email?: string; phone?: string } = {}) {
  const c = await db.query<{ id: string }>(
    `INSERT INTO contacts (display_name, company, email, phone, ico, dic, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
    [contact.name ?? 'Jana Dlouhá', contact.company ?? null, contact.email ?? null, contact.phone ?? null, contact.ico ?? null, contact.dic ?? null, contact.address ?? null],
  )
  const p = await db.query<{ id: string }>(
    `INSERT INTO projects (client_name, client_email, client_phone, description, price, contact_id)
     VALUES ($1, $2, $3, 'Web', 20000, $4) RETURNING id::text`,
    [contact.name ?? 'Jana Dlouhá', project.email ?? null, project.phone ?? null, c.rows[0].id],
  )
  return { contactId: c.rows[0].id, projectId: p.rows[0].id }
}

async function contactRow(id: string) {
  const res = await db.query<{ company: string | null; email: string | null; phone: string | null; ico: string | null; dic: string | null; address: string | null }>(
    `SELECT company, email, phone, ico, dic, address FROM contacts WHERE id = $1`,
    [id],
  )
  return res.rows[0]
}

const raw = (projectId: string, counterparty: Record<string, string>) => ({
  kind: 'single',
  projectId,
  counterparty,
  issuedOn: '2026-11-27',
  suppliedOn: '2026-11-27',
  dueOn: '2026-12-11',
  currency: 'CZK',
  items: [{ description: 'Web na míru', quantity: 1, unitPrice: 20000, vatRate: 0 }],
  note: '',
})

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      client_email text,
      client_phone text,
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
      company text, email text, phone text, ico text, dic text, note text,
      merged_into uuid
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id uuid, email text, phone text
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
    CREATE SCHEMA portal;
  `)
  await db.exec(read('053_invoices.sql'))
  await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)
  await db.exec(read('107_fakturace_vystavovani.sql'))
  await db.exec(read('117_faktury_koncepty.sql'))
  await db.exec(read('132_faktura_druh.sql'))
  const migration = read('140_fakturacni_udaje_klienta.sql')
  await db.exec(migration)
  // Idempotence: druhý běh nesmí spadnout.
  await db.exec(migration)

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

describe('e-mail a telefon odběratele na faktuře', () => {
  it('vytisknou se a po vystavení je nejde přepsat', async () => {
    const { projectId } = await seed({})
    const issued = await issueNewInvoice(
      raw(projectId, { name: 'Dlouhá s.r.o.', address: 'Dlouhá 1, Praha', ico: '27074358', dic: '', phone: '+420 777 123 456' }),
      'ucetni@dlouha.cz',
    )
    expect(issued.error).toBeUndefined()

    const pdf = await loadIssuedInvoiceForPdf(issued.id!)
    expect(pdf?.invoice.counterparty).toMatchObject({ email: 'ucetni@dlouha.cz', phone: '+420 777 123 456' })
    const html = await invoiceHtml(pdf!.invoice, { name: 'VIZEON', logo: null })
    expect(html).toContain('ucetni@dlouha.cz · +420 777 123 456')

    await expect(
      db.query(`UPDATE invoices SET client_contact = '{"phone":"+420 000 000 000"}'::jsonb WHERE id = $1`, [issued.id]),
    ).rejects.toThrow(/admin_invoice_locked/)
    // Adresa pro odeslání (migrace 117) se měnit smí — doklad se tím nemění.
    await db.query(`UPDATE invoices SET client_email = 'jinam@dlouha.cz' WHERE id = $1`, [issued.id])
    expect((await loadIssuedInvoiceForPdf(issued.id!))?.invoice.counterparty.email).toBe('ucetni@dlouha.cz')
  })

  it('telefon s písmeny faktura nepustí', async () => {
    const { projectId } = await seed({})
    const issued = await issueNewInvoice(raw(projectId, { name: 'Dlouhá s.r.o.', address: 'Dlouhá 1', ico: '', dic: '', phone: 'zavolej mi' }))
    expect(issued.error).toMatch(/Telefon/)
  })
})

describe('formulář bere sídlo a telefon z kontaktu', () => {
  it('bez minulé faktury: sídlo z kontaktu, telefon ze zakázky před kontaktem', async () => {
    const { projectId } = await seed({ company: 'Dlouhá s.r.o.', ico: '27074358', address: 'Krátká 5, Brno', phone: '+420777000111' }, { phone: '777 222 333' })
    const draft = await loadIssueDraft(projectId)
    expect(draft.counterparty).toMatchObject({ name: 'Dlouhá s.r.o.', address: 'Krátká 5, Brno', ico: '27074358', phone: '777 222 333' })
  })

  it('bez telefonu u zakázky vezme telefon kontaktu', async () => {
    const { projectId } = await seed({ phone: '+420777000222' })
    expect((await loadIssueDraft(projectId)).counterparty.phone).toBe('+420777000222')
  })
})

describe('vystavená faktura vrací údaje do kontaktu', () => {
  it('prázdný kontakt dostane IČO, DIČ, sídlo, telefon, e-mail i firmu', async () => {
    const { contactId, projectId } = await seed({ name: 'Petr Krátký' })
    const issued = await issueNewInvoice(
      raw(projectId, { name: 'Krátký stavby s.r.o.', address: 'Nová 3, Kolín', ico: '45274649', dic: 'CZ45274649', phone: '777 444 555' }),
      'petr@kratky.cz',
    )
    expect(issued.error).toBeUndefined()
    expect(await contactRow(contactId)).toEqual({
      company: 'Krátký stavby s.r.o.',
      email: 'petr@kratky.cz',
      phone: '+420777444555',
      ico: '45274649',
      dic: 'CZ45274649',
      address: 'Nová 3, Kolín',
    })
    // A odtud dál: zakázka si telefon a e-mail vzala taky (R-141).
    const project = await db.query<{ client_email: string; client_phone: string }>(
      `SELECT client_email, client_phone FROM projects WHERE id = $1`,
      [projectId],
    )
    expect(project.rows[0]).toEqual({ client_email: 'petr@kratky.cz', client_phone: '+420777444555' })
  })

  it('oprava předvyplněného sídla se do kontaktu propíše, jinak ruční hodnota v kontaktu zůstane', async () => {
    const corrected = await seed({ ico: '26185610', address: 'Stará 1' })
    await issueNewInvoice(
      raw(corrected.projectId, { name: 'Firma', address: 'Nová 9', ico: '26185610', dic: '' }),
      '',
      null,
      { name: 'Firma', address: 'Stará 1', ico: '26185610', dic: '', email: '', phone: '' },
    )
    expect((await contactRow(corrected.contactId)).address).toBe('Nová 9')

    // Jiný odběratel pro jednu fakturu (bez předvyplnění): kontakt drží svoje.
    const kept = await seed({ ico: '25596641', address: 'Stálá 2' })
    await issueNewInvoice(raw(kept.projectId, { name: 'Mateřská a.s.', address: 'Jinde 7', ico: '00006947', dic: '' }))
    expect(await contactRow(kept.contactId)).toMatchObject({ address: 'Stálá 2', ico: '25596641' })
  })

  it('fakturační e-mail nepřepíše e-mail, na který se klientovi píše', async () => {
    const { contactId, projectId } = await seed({ email: 'jana@dlouha.cz' })
    await issueNewInvoice(
      raw(projectId, { name: 'Dlouhá s.r.o.', address: 'Dlouhá 1', ico: '', dic: '' }),
      'fakturace@dlouha.cz',
      null,
      { name: '', address: '', ico: '', dic: '', email: 'jana@dlouha.cz', phone: '' },
    )
    expect((await contactRow(contactId)).email).toBe('jana@dlouha.cz')
  })
})

describe('úprava kontaktu se propíše do konceptů faktur', () => {
  it('prázdné a staré hodnoty se vymění, ručně jiné zůstanou', async () => {
    const { contactId, projectId } = await seed({ name: 'Eva Nová', email: 'eva@stara.cz', ico: '27074358', address: 'Stará 1' })
    const follows = await createDraft('manual', {
      projectId,
      counterparty: { name: 'Eva Nová', address: 'Stará 1', ico: '', dic: '' },
      email: 'eva@stara.cz',
      items: [{ description: 'Web', quantity: 1, unitPrice: 20000, vatRate: 0 }],
      currency: 'CZK', dueDays: 14, suppliedOn: '', note: '',
    })
    const own = await createDraft('manual', {
      projectId,
      counterparty: { name: 'Eva Nová', address: 'Pobočka 4', ico: '27074358', dic: '' },
      email: 'ucetni@nova.cz',
      items: [{ description: 'Správa', quantity: 1, unitPrice: 999, vatRate: 0 }],
      currency: 'CZK', dueDays: 14, suppliedOn: '', note: '',
    })

    const saved = await saveContact(contactId, {
      display_name: 'Eva Nová', company: null, email: 'eva@nova.cz', phone: '777 888 999',
      ico: '27074358', dic: 'CZ27074358', address: 'Nová 2, Praha', note: null,
    })
    expect(saved.ok).toBe(true)

    const a = await getDraft(follows)
    expect(a?.counterparty).toMatchObject({ address: 'Nová 2, Praha', ico: '27074358', dic: 'CZ27074358', phone: '+420777888999' })
    expect(a?.email).toBe('eva@nova.cz')

    const b = await getDraft(own)
    expect(b?.counterparty).toMatchObject({ address: 'Pobočka 4', ico: '27074358', dic: 'CZ27074358' })
    expect(b?.email).toBe('ucetni@nova.cz')
  })

  it('schválený koncept nese e-mail i telefon na faktuře', async () => {
    const { projectId } = await seed({})
    const id = await createDraft('manual', {
      projectId,
      counterparty: { name: 'Malá s.r.o.', address: 'Malá 1, Plzeň', ico: '', dic: '', phone: '+420 600 100 200' },
      email: 'mala@example.cz',
      items: [{ description: 'Web', quantity: 1, unitPrice: 20000, vatRate: 0 }],
      currency: 'CZK', dueDays: 14, suppliedOn: '', note: '',
    })
    const issued = await issueDraft(id)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const pdf = await loadIssuedInvoiceForPdf(issued.invoiceId)
    expect(pdf?.invoice.counterparty).toMatchObject({ email: 'mala@example.cz', phone: '+420 600 100 200' })
  })
})
