import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Vstupy do archivu faktur (AD13, krok 6).
 *
 * Tři cesty, kterými se faktura dostane do databáze, neměly do AD13 **žádný**
 * test: formulář (`parseInvoiceForm` → `insertInvoice`/`updateInvoiceRow`)
 * a veřejné API pro n8n (`/api/public/invoices`). Všechny tři sahají na
 * peníze: `paid_on` rozhoduje o zdanitelném příjmu a `amount` o jeho výši.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

let db: PGlite
const aiMock = vi.fn()
const notifyMock = vi.fn()
const rateLimitedMock = vi.fn()
const apiKeyMock = vi.fn()

vi.mock('@/lib/auth', () => ({ authOptions: {}, requireAuth: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + part + (i < params.length ? `$${i + 1}` : ''), '')
    const res = await db.query(text, params as unknown[])
    return res.rows
  },
}))
vi.mock('@/lib/invoice-ai', () => ({ extractInvoiceFromPdf: (...a: unknown[]) => aiMock(...a) }))
vi.mock('@/lib/notifications', () => ({ createNotification: (...a: unknown[]) => notifyMock(...a) }))
vi.mock('@/lib/api-auth', () => ({
  verifyBearerApiKey: (...a: unknown[]) => apiKeyMock(...a),
  getClientIp: () => '203.0.113.10',
}))
vi.mock('@/lib/api-rate-limit', () => ({
  isApiRateLimited: (...a: unknown[]) => rateLimitedMock(...a),
  recordApiRequest: async () => undefined,
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { resetLedgerCurrencyForTests } from '@/lib/admin/ledger'
import { insertInvoice, parseInvoiceForm, updateInvoiceRow, type InvoiceInput } from '@/lib/invoices'
import { POST } from '@/app/api/public/invoices/route'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const PDF = Buffer.from('%PDF-1.4 ukázkový obsah', 'latin1')

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(text, params)
  return res.rows
}

function formData(values: Record<string, string>, file?: File): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  if (file) fd.set('pdf', file)
  return fd
}

const base = {
  invoice_number: '2026-900',
  issued_on: '2026-03-01',
  due_on: '2026-03-15',
  amount: '12000',
  currency: 'CZK',
}

const request = (body: unknown): Request =>
  new Request('https://www.zakaziq.cz/api/public/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const invoice = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  invoice_number: `F-${Math.random().toString(36).slice(2, 8)}`,
  project_id: null,
  client_name: 'Klient s.r.o.',
  client_ico: null,
  client_dic: null,
  issued_on: '2026-03-01',
  due_on: '2026-03-15',
  paid_on: null,
  amount: 5000,
  currency: 'CZK',
  note: null,
  ai_extracted: null,
  ...over,
})

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL, description text, lead_origin text NOT NULL DEFAULT 'vizeon',
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE costs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
      amount numeric NOT NULL DEFAULT 0, cost_type text NOT NULL, category text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
      amount numeric NOT NULL, type text NOT NULL CHECK (type IN ('income', 'expense')),
      category text NOT NULL, note text, date date NOT NULL,
      declared boolean NOT NULL DEFAULT false,
      deposit_transaction boolean NOT NULL DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_cost_id uuid, recurring_period text, created_at timestamptz DEFAULT now()
    );
  `)
  await db.exec(read('053_invoices.sql'))
  await db.exec(`ALTER TABLE finance_transactions ADD COLUMN source_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;`)
  await db.exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;`)
  const migration = read('109_finance_meny_a_naklady.sql')
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
  await db.exec(`DELETE FROM finance_transactions; DELETE FROM invoices; DELETE FROM projects;`)
  aiMock.mockReset()
  notifyMock.mockReset()
  rateLimitedMock.mockReset()
  apiKeyMock.mockReset()
  rateLimitedMock.mockResolvedValue(false)
  apiKeyMock.mockReturnValue(true)
  notifyMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseInvoiceForm', () => {
  it('vezme vyplněný formulář i s PDF', async () => {
    const file = new File([PDF], 'faktura.pdf', { type: 'application/pdf' })
    const parsed = await parseInvoiceForm(formData({ ...base, paid_on: '2026-03-10', note: ' pozn ' }, file))
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return

    expect(parsed.data.amount).toBe(12000)
    expect(parsed.data.paid_on).toBe('2026-03-10')
    expect(parsed.data.note).toBe('pozn')
    expect(parsed.pdf?.filename).toBe('faktura.pdf')
    expect(parsed.removePdf).toBe(false)
  })

  it('chybějící číslo nebo datum vystavení odmítne', async () => {
    const bezCisla = await parseInvoiceForm(formData({ ...base, invoice_number: '   ' }))
    expect(bezCisla).toEqual({ error: 'Číslo faktury je povinné' })

    const bezData = await parseInvoiceForm(formData({ ...base, issued_on: '' }))
    expect(bezData).toEqual({ error: 'Datum vystavení je povinné' })
  })

  it('datum v jiném tvaru než YYYY-MM-DD neprojde', async () => {
    expect(await parseInvoiceForm(formData({ ...base, issued_on: '1. 3. 2026' }))).toEqual({
      error: 'Datum vystavení je povinné',
    })
    expect(await parseInvoiceForm(formData({ ...base, due_on: '15.3.2026' }))).toEqual({
      error: 'Neplatné datum splatnosti',
    })
    expect(await parseInvoiceForm(formData({ ...base, paid_on: 'dnes' }))).toEqual({
      error: 'Neplatné datum zaplacení',
    })
  })

  it('částka musí být číslo a nesmí být záporná — jde do daňového základu', async () => {
    for (const bad of ['', 'dvanáct', '-500']) {
      expect(await parseInvoiceForm(formData({ ...base, amount: bad }))).toEqual({ error: 'Neplatná částka' })
    }
    const nula = await parseInvoiceForm(formData({ ...base, amount: '0' }))
    expect('error' in nula).toBe(false)
  })

  it('cizí měnu mimo seznam nepustí dál', async () => {
    expect(await parseInvoiceForm(formData({ ...base, currency: 'USD' }))).toEqual({
      error: 'Nepodporovaná měna',
    })
    const male = await parseInvoiceForm(formData({ ...base, currency: 'eur' }))
    expect('error' in male ? male : male.data.currency).toBe('EUR')
  })

  it('soubor, který není PDF, se nepřijme podle přípony ani MIME typu', async () => {
    const podvod = new File([Buffer.from('GIF89a ne a ne')], 'faktura.pdf', { type: 'application/pdf' })
    expect(await parseInvoiceForm(formData(base, podvod))).toEqual({ error: 'Soubor není PDF' })
  })

  it('poškozený AI přepis uložení nezablokuje — jen se zahodí', async () => {
    const parsed = await parseInvoiceForm(formData({ ...base, ai_extracted: '{tohle není json' }))
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.data.ai_extracted).toBeNull()
  })

  it('`remove_pdf` se propíše', async () => {
    const parsed = await parseInvoiceForm(formData({ ...base, remove_pdf: '1' }))
    expect('error' in parsed ? null : parsed.removePdf).toBe(true)
  })
})

describe('updateInvoiceRow', () => {
  it('uloží změny a zároveň srovná ledger', async () => {
    const { id } = await insertInvoice(invoice({ amount: 5000, paid_on: '2026-03-10' }), null)
    const [pred] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    expect(pred.n).toBe(1)

    // Zrušené zaplacení → faktura je zpátky pohledávka a příjem zmizí.
    await updateInvoiceRow(id, invoice({ amount: 5000, paid_on: null, invoice_number: 'F-upraveno' }), null, false)

    const [po] = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    const [inv] = await rows<{ invoice_number: string; finance_transaction_id: string | null }>(
      `SELECT invoice_number, finance_transaction_id::text FROM invoices WHERE id = $1`,
      [id],
    )
    expect(po.n).toBe(0)
    expect(inv.invoice_number).toBe('F-upraveno')
    expect(inv.finance_transaction_id).toBeNull()
  })

  it('nová částka se propíše i do příjmu v ledgeru', async () => {
    const { id } = await insertInvoice(invoice({ amount: 5000, paid_on: '2026-03-10' }), null)
    await updateInvoiceRow(id, invoice({ amount: 7500, paid_on: '2026-03-12' }), null, false)

    const [tx] = await rows<{ amount: string; date: string }>(
      `SELECT amount, date::text FROM finance_transactions WHERE source_invoice_id = $1`,
      [id],
    )
    expect({ amount: Number(tx.amount), date: tx.date }).toEqual({ amount: 7500, date: '2026-03-12' })
  })

  it('běžná editace nepřepíše dřívější AI přepis prázdnou hodnotou', async () => {
    const { id } = await insertInvoice(
      invoice({ ai_extracted: { invoice_number: 'z PDF' } as never }),
      null,
    )
    await updateInvoiceRow(id, invoice({ ai_extracted: null }), null, false)
    const [inv] = await rows<{ ai_extracted: unknown }>(`SELECT ai_extracted FROM invoices WHERE id = $1`, [id])
    expect(inv.ai_extracted).not.toBeNull()
  })

  it('odebrání PDF smaže obsah i jméno souboru', async () => {
    const { id } = await insertInvoice(invoice(), {
      base64: PDF.toString('base64'),
      filename: 'faktura.pdf',
      size: PDF.byteLength,
    })
    await updateInvoiceRow(id, invoice(), null, true)
    const [inv] = await rows<{ has_pdf: boolean; pdf_filename: string | null }>(
      `SELECT (pdf_data IS NOT NULL) AS has_pdf, pdf_filename FROM invoices WHERE id = $1`,
      [id],
    )
    expect(inv).toEqual({ has_pdf: false, pdf_filename: null })
  })
})

describe('POST /api/public/invoices', () => {
  it('bez platného klíče neuloží nic', async () => {
    apiKeyMock.mockReturnValue(false)
    const res = await POST(request({ ...base, amount: 12000 }) as never)
    expect(res.status).toBe(401)
    const [count] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM invoices`)
    expect(count.n).toBe(0)
  })

  it('přes limit požadavků odpoví 429', async () => {
    rateLimitedMock.mockResolvedValue(true)
    const res = await POST(request({ ...base, amount: 12000 }) as never)
    expect(res.status).toBe(429)
  })

  it('rozbité JSON a špatná data mají vlastní kódy', async () => {
    const rozbite = await POST(request('{tohle není json') as never)
    expect(rozbite.status).toBe(400)
    expect((await rozbite.json()).code).toBe('INVALID_BODY')

    const spatne = await POST(request({ ...base, amount: -5 }) as never)
    expect(spatne.status).toBe(400)
    expect((await spatne.json()).code).toBe('VALIDATION_ERROR')
  })

  it('uloží fakturu a při zaplacení i příjem do ledgeru', async () => {
    const res = await POST(
      request({ invoice_number: '2026-901', issued_on: '2026-04-01', amount: 9000, paid_on: '2026-04-05' }) as never,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.invoice.ai_used).toBe(false)

    const [tx] = await rows<{ amount: string; date: string; declared: boolean; currency: string }>(
      `SELECT t.amount, t.date::text, t.declared, t.currency
       FROM finance_transactions t JOIN invoices i ON i.id = t.source_invoice_id
       WHERE i.invoice_number = '2026-901'`,
    )
    expect({ amount: Number(tx.amount), date: tx.date, declared: tx.declared, currency: tx.currency }).toEqual({
      amount: 9000,
      date: '2026-04-05',
      declared: true,
      currency: 'CZK',
    })
    expect(notifyMock).toHaveBeenCalled()
  })

  it('pohledávka příjem nezaloží — zdanitelný je až zaplacený doklad', async () => {
    await POST(request({ invoice_number: '2026-902', issued_on: '2026-04-01', amount: 4000 }) as never)
    const [count] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM finance_transactions`)
    expect(count.n).toBe(0)
  })

  it('eurová faktura uloží příjem v eurech', async () => {
    await POST(
      request({
        invoice_number: '2026-903',
        issued_on: '2026-04-01',
        amount: 300,
        currency: 'EUR',
        paid_on: '2026-04-02',
      }) as never,
    )
    const [tx] = await rows<{ currency: string }>(
      `SELECT currency FROM finance_transactions WHERE amount = 300`,
    )
    expect(tx.currency).toBe('EUR')
  })

  it('nečitelné PDF neudělá fakturu z vymyšlených čísel', async () => {
    aiMock.mockResolvedValue({ data: null })
    const res = await POST(
      request({ pdf_base64: PDF.toString('base64'), pdf_filename: 'f.pdf' }) as never,
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('INCOMPLETE_INVOICE')
    const [count] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM invoices`)
    expect(count.n).toBe(0)
  })

  it('co není PDF, se neuloží ani jako příloha', async () => {
    const res = await POST(
      request({ ...base, amount: 100, pdf_base64: Buffer.from('GIF89a').toString('base64') }) as never,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_PDF')
  })

  it('AI doplní jen chybějící pole a zaplacení si nevymýšlí', async () => {
    aiMock.mockResolvedValue({
      data: { invoice_number: '2026-904', issued_on: '2026-05-01', amount: 2500, paid_on: '2026-05-02' },
    })
    const res = await POST(request({ pdf_base64: PDF.toString('base64') }) as never)
    expect(res.status).toBe(201)

    const [inv] = await rows<{ invoice_number: string; paid_on: string | null }>(
      `SELECT invoice_number, paid_on::text FROM invoices LIMIT 1`,
    )
    // `paid_on` z PDF se ignoruje — rozhoduje o zdanitelném příjmu.
    expect(inv).toEqual({ invoice_number: '2026-904', paid_on: null })
  })

  it('stejné číslo faktury podruhé vrátí 409 a nic nepřepíše', async () => {
    await POST(request({ invoice_number: '2026-905', issued_on: '2026-04-01', amount: 1000 }) as never)
    const druhy = await POST(
      request({ invoice_number: '2026-905', issued_on: '2026-04-02', amount: 2000 }) as never,
    )
    expect(druhy.status).toBe(409)
    expect((await druhy.json()).code).toBe('DUPLICATE_INVOICE')

    const [inv] = await rows<{ amount: string }>(
      `SELECT amount FROM invoices WHERE invoice_number = '2026-905'`,
    )
    expect(Number(inv.amount)).toBe(1000)
  })
})
