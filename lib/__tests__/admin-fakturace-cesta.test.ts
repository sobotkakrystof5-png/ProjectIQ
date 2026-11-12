import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { IssuerProfile } from '@/lib/admin/invoice-schema'

/**
 * Celá cesta faktury (AD12): **server action z formuláře → doklad v databázi →
 * HTTP routa s PDF → e-mail s přílohou**.
 *
 * Jednotlivé kusy mají vlastní testy; tenhle je pouští za sebou tak, jak je
 * volá aplikace — včetně skutečného kódu route handlerů. Databáze je PGlite
 * s migrací 107 (stejné SQL, jaké jde na Neon), přihlášení a odesílací
 * schránka jsou podstrčené; všechno ostatní je ostrý kód.
 *
 * Co tím ověřit nejde: klik v prohlížeči na produkční databázi a skutečné
 * doručení e-mailu. To zůstává v otevřených problémech.
 */

const dbRef: { current: PGlite | null } = { current: null }
const odeslane: { to: string; subject: string; attachments?: { filename: string; content: Buffer }[] }[] = []

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => ({ user: { email: 'admin@example.cz' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const createTransport = () => ({
  sendMail: async (message: (typeof odeslane)[number]) => {
    odeslane.push(message)
    return { messageId: 'test' }
  },
})
// `lib/email.ts` sahá po pojmenovaném exportu (`await import('nodemailer')`).
vi.mock('nodemailer', () => ({ createTransport, default: { createTransport } }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`
    return (await dbRef.current!.query(text, values)).rows
  },
}))

const { setAdminDbForTests } = await import('@/lib/admin/db')
const { pgliteAdminDriver } = await import('./helpers/admin-pglite')
const { issueInvoiceAction, cancelInvoiceAction } = await import('@/app/dashboard/faktury/actions')
const { saveIssuerProfile } = await import('@/lib/admin/invoicing')
const pdfRoute = await import('@/app/api/invoices/[id]/pdf/route')
const sendRoute = await import('@/app/api/invoices/[id]/odeslat/route')

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

const PROFILE: IssuerProfile = {
  name: 'Ukázkový dodavatel', address: 'Ukázková 1, 100 00 Praha', ico: '12345679', dic: '',
  bank: 'CZ6508000000192000145399', email: 'ukazka@example.cz', phone: '', vatPayer: false,
}

/** Přesně to, co posílá formulář `components/admin/invoices/issue-form.tsx`. */
const zFormulare = {
  projectId: null,
  contactId: null,
  counterparty: { name: 'Ukázková firma s.r.o.', address: 'Ukázková 2, 100 00 Praha', ico: '12345679', dic: '', email: 'klient@example.cz' },
  issuedOn: '2026-11-12',
  suppliedOn: '2026-11-12',
  dueOn: '2026-11-26',
  currency: 'CZK' as const,
  items: [{ description: 'Web na míru', quantity: 1, unitPrice: 24000, vatRate: 0 as const }],
  note: '',
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (headers: Record<string, string> = {}) =>
  ({ headers: new Headers(headers) }) as unknown as Parameters<typeof pdfRoute.GET>[0]

beforeAll(async () => {
  db = new PGlite()
  dbRef.current = db
  await db.exec(`
    CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL);
    CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE finance_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL, type text NOT NULL, category text, note text, date date NOT NULL, user_id uuid, source_project_id uuid, source_invoice_id uuid, declared boolean DEFAULT false);
    CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL, project_id uuid REFERENCES projects(id) ON DELETE SET NULL, client_name text, client_ico text, client_dic text, issued_on date NOT NULL, due_on date, paid_on date, amount numeric NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'CZK', note text, pdf_data bytea, pdf_filename text, pdf_size integer, ai_extracted jsonb, finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz);
    CREATE UNIQUE INDEX invoices_number_key ON invoices (invoice_number);
  `)
  await db.exec(fs.readFileSync(path.join(ROOT, 'migrations/107_fakturace_vystavovani.sql'), 'utf8'))
  setAdminDbForTests(pgliteAdminDriver(db))
  process.env.GMAIL_USER = 'info@example.cz'
  process.env.GMAIL_APP_PASSWORD = 'test test test test'
  await saveIssuerProfile(PROFILE)
})

afterAll(async () => {
  setAdminDbForTests(null)
  dbRef.current = null
  await db.close()
})

describe('od formuláře k dokladu', () => {
  it('server action přijme přesně to, co posílá obrazovka, a vrátí číslo', async () => {
    const result = await issueInvoiceAction(zFormulare)
    expect(result.error).toBeUndefined()
    expect(result.number).toBe('2026001')

    const [row] = (await db.query<{ amount: string; client_email: string; pdf_generated: boolean }>(
      `SELECT amount::text, client_email, pdf_generated FROM invoices WHERE invoice_number = '2026001'`,
    )).rows
    expect(row).toMatchObject({ amount: '24000', client_email: 'klient@example.cz', pdf_generated: true })
  })

  it('cizí adresa nebo rozbitý vstup skončí hláškou, ne pádem', async () => {
    expect((await issueInvoiceAction({ ...zFormulare, items: [] })).error).toMatch(/aspoň jednu položku/)
    expect((await issueInvoiceAction({ ...zFormulare, dueOn: '2026-01-01' })).error).toMatch(/Splatnost/)
    expect((await cancelInvoiceAction('necoCoNeniId')).error).toBe('Faktura nenalezena')
  })
})

describe('HTTP routa s PDF', () => {
  it.runIf(process.env.ADMIN_PDF_SMOKE === '1')('vyrobí PDF, uloží ho k dokladu a podruhé vrátí 304', async () => {
    const [{ id }] = (await db.query<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)).rows

    const prvni = await pdfRoute.GET(request(), params(id))
    expect(prvni.status).toBe(200)
    expect(prvni.headers.get('content-type')).toBe('application/pdf')
    const bajty = Buffer.from(await prvni.arrayBuffer())
    expect(bajty.subarray(0, 5).toString()).toBe('%PDF-')

    const [ulozene] = (await db.query<{ velikost: number }>(
      `SELECT octet_length(pdf_data) AS velikost FROM invoices WHERE id = $1`, [id],
    )).rows
    expect(ulozene.velikost).toBe(bajty.byteLength)

    const etag = prvni.headers.get('etag')!
    const druhy = await pdfRoute.GET(request({ 'if-none-match': etag }), params(id))
    expect(druhy.status).toBe(304)
  }, 90000)

  it('archivní doklad bez nahraného PDF vrací 404, neplatné id taky', async () => {
    await db.exec(`INSERT INTO invoices (invoice_number, issued_on, amount) VALUES ('CIZI-9', '2026-01-01', 100)`)
    const [{ id }] = (await db.query<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = 'CIZI-9'`)).rows

    expect((await pdfRoute.GET(request(), params(id))).status).toBe(404)
    expect((await pdfRoute.GET(request(), params('neco'))).status).toBe(404)
  })
})

describe('odeslání e-mailem', () => {
  it('pošle doklad v příloze a zapíše, kdy odešel', async () => {
    const [{ id }] = (await db.query<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)).rows
    // PDF už u dokladu leží (buď z routy výš, nebo se podstrčí, aby test nepotřeboval Chromium).
    await db.query(
      `UPDATE invoices SET pdf_data = COALESCE(pdf_data, decode($2, 'base64')), pdf_filename = 'faktura-2026001.pdf' WHERE id = $1`,
      [id, Buffer.from('%PDF-1.4 test').toString('base64')],
    )

    const response = await sendRoute.POST(request({ 'sec-fetch-site': 'same-origin' }), params(id))
    expect(response.status).toBe(200)

    const zprava = odeslane.at(-1)!
    expect(zprava.to).toBe('klient@example.cz')
    expect(zprava.subject).toBe('Faktura 2026001')
    expect(zprava.attachments?.[0].filename).toBe('faktura-2026001.pdf')
    expect(zprava.attachments?.[0].content.subarray(0, 5).toString()).toBe('%PDF-')

    const [row] = (await db.query<{ odeslano: boolean }>(`SELECT sent_at IS NOT NULL AS odeslano FROM invoices WHERE id = $1`, [id])).rows
    expect(row.odeslano).toBe(true)
  })

  it('cizí původ odmítne, stornovanou fakturu neposílá', async () => {
    const [{ id }] = (await db.query<{ id: string }>(`SELECT id FROM invoices WHERE invoice_number = '2026001'`)).rows
    const cizi = await sendRoute.POST(request({ 'sec-fetch-site': 'cross-site' }), params(id))
    expect(cizi.status).toBe(403)

    await cancelInvoiceAction(id)
    const stornovana = await sendRoute.POST(request({ 'sec-fetch-site': 'same-origin' }), params(id))
    expect(stornovana.status).toBe(400)
    expect(await stornovana.json()).toEqual({ error: 'Stornovanou fakturu neposíláme.' })
  })
})
