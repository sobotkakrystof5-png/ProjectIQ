import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Druh faktury a rozpis ceny zakázky (R-143, migrace 132) proti skutečnému
 * Postgresu (PGlite).
 *
 * Co se slibuje: před vystavením se vždy vybere druh, zálohová a částečná
 * faktura vezme procento z ceny zakázky, finální všechno, co zbývá, a nikdy
 * se nevyfakturuje víc, než je cena. Částku počítá server — co pošle
 * prohlížeč, na doklad nejde.
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
import { loadIssuedInvoiceForPdf, resetIssuingReadyForTests, saveIssuerProfile } from '@/lib/admin/invoice-issue'
import type { IssuerProfile } from '@/lib/admin/invoice-issue-schema'
import { createDraft, issueDraft, prepareProjectDoneDraft, resetDraftsReadyForTests } from '@/lib/admin/invoice-drafts'
import { loadProjectBilling, resetKindsReadyForTests } from '@/lib/admin/project-billing'
import {
  amountForPercent,
  billingOverview,
  kindAvailability,
  kindItemDescription,
  resolveKindPlan,
  type ProjectBilling,
} from '@/lib/admin/invoice-kinds'
import { cancelIssuedInvoice, issueNewInvoice } from '@/app/dashboard/finance/invoice-actions'
import { invoiceHtml } from '@/lib/invoice-pdf/render'
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
  registry: 'Fyzická osoba zapsaná v živnostenském rejstříku, Magistrát města Mladá Boleslav',
  phone: '',
  web: 'vizeon.cz',
}

const BRAND = { name: 'VIZEON', logo: null }

async function project(price: number, over: { description?: string; status?: string } = {}): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO projects (client_name, client_email, description, price, status)
     VALUES ('Kavárna U Mostu', 'kavarna@example.cz', $1, $2, $3) RETURNING id::text`,
    [over.description ?? 'Nový web', price, over.status ?? 'in_progress'],
  )
  return res.rows[0].id
}

/** Vystavení tak, jak ho pošle formulář. Cenu položky schválně posíláme špatnou. */
function issue(projectId: string | null, kind: string | undefined, percent: number | null = null) {
  return issueNewInvoice({
    ...(kind ? { kind } : {}),
    percent,
    projectId,
    counterparty: { name: 'Kavárna U Mostu s.r.o.', address: 'Mostní 1, Praha', ico: '27074358', dic: '' },
    issuedOn: '2026-11-24',
    suppliedOn: '2026-11-24',
    dueOn: '2026-12-08',
    currency: 'CZK',
    // Popis z formuláře zůstane, cena ne.
    items: [{ description: `Nový web — ${kind ?? 'bez druhu'}`, quantity: 1, unitPrice: 1, vatRate: 0 }],
    note: '',
  })
}

async function invoiceRow(id: string) {
  const res = await db.query<{
    invoice_number: string
    amount: number
    invoice_kind: string | null
    share_percent: number | null
    settlement: { thisAmount: number; remainingAfter: number; paidOutside: number; invoices: { number: string; paid: boolean }[] } | null
    items: { description: string; unitPrice: number }[]
  }>(
    `SELECT invoice_number, amount::float AS amount, invoice_kind, share_percent::float AS share_percent, settlement, items
     FROM invoices WHERE id = $1`,
    [id],
  )
  return res.rows[0]
}

async function pay(id: string): Promise<void> {
  await db.query(`UPDATE invoices SET paid_on = '2026-11-25' WHERE id = $1`, [id])
  await syncInvoiceTransaction(id)
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
  const migration = read('132_faktura_druh.sql')
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

// ─── Výpočty bez databáze ────────────────────────────────────────────────────

const billing = (over: Partial<ProjectBilling> = {}): ProjectBilling => ({
  projectId: 'p',
  label: 'Kavárna — Nový web',
  description: 'Nový web',
  price: 100000,
  paid: 0,
  invoices: [],
  ...over,
})

describe('rozpis ceny zakázky', () => {
  it('rozliší zaplacené, čekající a nevyfakturované', () => {
    const o = billingOverview(billing({
      paid: 30000,
      invoices: [
        { number: '2026001', kind: 'deposit', amount: 30000, paid: true },
        { number: '2026002', kind: 'partial', amount: 20000, paid: false },
      ],
    }))
    expect(o).toMatchObject({ paid: 30000, open: 20000, free: 50000, toPay: 70000, paidOutside: 0, freePct: 50 })
  })

  it('záloha zapsaná bez faktury se ukáže zvlášť', () => {
    expect(billingOverview(billing({ paid: 15000 })).paidOutside).toBe(15000)
  })

  it('bez zakázky jde jen faktura za celé dílo', () => {
    const a = kindAvailability(null)
    expect(a.single).toBeNull()
    expect(a.deposit).toContain('Vyberte zakázku')
  })

  it('na začátku nejde finální, po záloze nejde za celé dílo', () => {
    expect(kindAvailability(billing()).final).toContain('Zatím není co odečíst')
    const after = kindAvailability(billing({ invoices: [{ number: '2026001', kind: 'deposit', amount: 30000, paid: false }] }))
    expect(after.single).toContain('částečnou nebo finální')
    expect(after.final).toBeNull()
  })

  it('30 / 30 / 40 z lichých korun vyjde přesně na cenu', () => {
    const price = 33333
    const first = amountForPercent(price, 30)
    const second = amountForPercent(price, 30)
    const plan = resolveKindPlan('partial', 40, billing({
      price,
      invoices: [
        { number: '1', kind: 'deposit', amount: first, paid: true },
        { number: '2', kind: 'partial', amount: second, paid: false },
      ],
      paid: first,
    }))
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(first + second + (plan.plan.amount ?? 0)).toBe(price)
  })

  it('víc, než zbývá, nevyfakturuje', () => {
    const plan = resolveKindPlan('partial', 80, billing({ invoices: [{ number: '1', kind: 'deposit', amount: 30000, paid: true }], paid: 30000 }))
    expect(plan).toEqual({ ok: false, error: expect.stringContaining('zbývá jen') })
  })

  it('popis položky řekne, o jakou část jde', () => {
    expect(kindItemDescription('deposit', 'Nový web', 30)).toBe('Nový web — záloha 30 %')
    expect(kindItemDescription('final', '', 40)).toBe('Zakázka — doplatek 40 % ceny')
  })
})

// ─── Celá cesta: záloha → částečná → finální ─────────────────────────────────

describe('zálohová, částečná a finální faktura', () => {
  let projectId: string
  let depositId: string
  let partialId: string
  let finalId: string

  beforeAll(async () => {
    projectId = await project(100000)
  })

  it('bez druhu faktura nevznikne', async () => {
    const result = await issue(projectId, undefined)
    expect(result.error).toBe('Vyberte, o jakou fakturu jde.')
  })

  it('zálohová vezme 30 % z ceny, ne částku z prohlížeče', async () => {
    const result = await issue(projectId, 'deposit', 30)
    expect(result.error).toBeUndefined()
    depositId = result.id!
    const row = await invoiceRow(depositId)
    expect(row.amount).toBe(30000)
    expect(row.invoice_kind).toBe('deposit')
    expect(row.share_percent).toBe(30)
    expect(row.items[0]).toMatchObject({ description: 'Nový web — deposit', unitPrice: 30000 })
    expect(row.settlement).toMatchObject({ thisAmount: 30000, remainingAfter: 70000, invoices: [] })
  })

  it('po záloze už nejde faktura za celé dílo', async () => {
    const result = await issue(projectId, 'single')
    expect(result.error).toContain('částečnou nebo finální')
  })

  it('částečná nepřesáhne, co zbývá vyfakturovat', async () => {
    await pay(depositId)
    const result = await issue(projectId, 'partial', 80)
    expect(result.error).toContain('zbývá jen')
  })

  it('částečná 30 % a v rozpisu zaplacená záloha', async () => {
    const result = await issue(projectId, 'partial', 30)
    expect(result.error).toBeUndefined()
    partialId = result.id!
    const row = await invoiceRow(partialId)
    expect(row.amount).toBe(30000)
    expect(row.settlement?.invoices).toEqual([expect.objectContaining({ number: '2026001', paid: true })])
    expect(row.settlement?.remainingAfter).toBe(40000)
  })

  it('finální vezme všechno, co zbývá, i když předchozí faktura ještě čeká', async () => {
    const result = await issue(projectId, 'final')
    expect(result.error).toBeUndefined()
    finalId = result.id!
    const row = await invoiceRow(finalId)
    expect(row.amount).toBe(40000)
    expect(row.share_percent).toBe(40)
    expect(row.settlement?.invoices.map(i => [i.number, i.paid])).toEqual([['2026001', true], ['2026002', false]])
    expect(row.settlement?.remainingAfter).toBe(0)
  })

  it('celou vyfakturovanou zakázku už fakturovat nejde', async () => {
    const result = await issue(projectId, 'partial', 10)
    expect(result.error).toBe('Zakázka je celá vyfakturovaná.')
  })

  it('druh a rozpis vystaveného dokladu nejde přepsat', async () => {
    await expect(db.query(`UPDATE invoices SET invoice_kind = 'single' WHERE id = $1`, [depositId])).rejects.toThrow(/admin_invoice_locked/)
    await expect(db.query(`UPDATE invoices SET settlement = '{}'::jsonb WHERE id = $1`, [finalId])).rejects.toThrow(/admin_invoice_locked/)
  })

  it('PDF finální faktury ukáže rozpis a odečtené faktury', async () => {
    const doc = await loadIssuedInvoiceForPdf(finalId)
    expect(doc?.invoice.document?.kind).toBe('final')
    const html = await invoiceHtml(doc!.invoice, BRAND)
    expect(html).toContain('Konečná faktura')
    expect(html).toContain('Rozpis ceny zakázky')
    expect(html).toContain('Zálohová faktura 2026001')
    expect(html).toContain('uhrazeno')
    expect(html).toContain('Částečná faktura 2026002')
    expect(html).toContain('čeká na úhradu')
    expect(html).toContain('Zbývá k fakturaci')
  })

  it('PDF zálohové faktury nemá datum plnění a říká, že není daňový doklad', async () => {
    const doc = await loadIssuedInvoiceForPdf(depositId)
    const html = await invoiceHtml(doc!.invoice, BRAND)
    expect(html).toContain('<div class="doc-kind">Zálohová faktura</div>')
    expect(html).toContain('Zálohová faktura není daňový doklad.')
    expect(html).not.toContain('Datum uskutečnění plnění')
    expect(html).toContain('30 % ceny')
  })

  it('storno finální faktury vrátí zbytek k fakturaci', async () => {
    expect((await cancelIssuedInvoice(finalId)).error).toBeUndefined()
    const b = await loadProjectBilling(projectId)
    expect(billingOverview(b!).free).toBe(40000)
    expect(kindAvailability(b).final).toBeNull()
  })
})

describe('bez zakázky', () => {
  it('faktura za celé dílo bez zakázky jde jako dřív a nese druh', async () => {
    const result = await issueNewInvoice({
      kind: 'single',
      projectId: null,
      counterparty: { name: 'Jednorázový klient', address: 'Krátká 2, Brno', ico: '', dic: '' },
      issuedOn: '2026-11-24',
      suppliedOn: '2026-11-24',
      dueOn: '2026-12-08',
      currency: 'EUR',
      items: [{ description: 'Konzultace', quantity: 2, unitPrice: 50, vatRate: 0 }],
      note: '',
    })
    expect(result.error).toBeUndefined()
    const row = await invoiceRow(result.id!)
    expect(row).toMatchObject({ amount: 100, invoice_kind: 'single', settlement: null })
  })

  it('zálohová bez zakázky nevznikne', async () => {
    expect((await issue(null, 'deposit', 30)).error).toContain('Vyberte zakázku')
  })
})

// ─── Koncepty ────────────────────────────────────────────────────────────────

describe('koncept si pamatuje druh a částku přepočítá při schválení', () => {
  it('hotová zakázka se zálohou dostane koncept finální faktury na zbytek', async () => {
    const id = await project(50000, { status: 'done' })
    await db.query(
      `INSERT INTO finance_transactions (amount, type, category, source_project_id) VALUES (15000, 'income', 'záloha', $1)`,
      [id],
    )
    const draftId = await prepareProjectDoneDraft(id)
    expect(draftId).not.toBeNull()
    const draft = await db.query<{ invoice_kind: string; items: { unitPrice: number; description: string }[] }>(
      `SELECT invoice_kind, items FROM invoice_drafts WHERE id = $1`,
      [draftId],
    )
    expect(draft.rows[0].invoice_kind).toBe('final')
    expect(draft.rows[0].items[0]).toMatchObject({ unitPrice: 35000, description: 'Nový web — doplatek 70 % ceny' })

    await db.query(
      `UPDATE invoice_drafts SET counterparty = jsonb_set(counterparty, '{address}', '"Mostní 1, Praha"') WHERE id = $1`,
      [draftId],
    )
    const issued = await issueDraft(draftId!)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const row = await invoiceRow(issued.invoiceId)
    expect(row).toMatchObject({ amount: 35000, invoice_kind: 'final' })
    expect(row.settlement).toMatchObject({ paidOutside: 15000, remainingAfter: 0 })
  })

  it('hotová zakázka bez zálohy dostane fakturu za celé dílo', async () => {
    const id = await project(20000, { status: 'done' })
    const draftId = await prepareProjectDoneDraft(id)
    const draft = await db.query<{ invoice_kind: string }>(`SELECT invoice_kind FROM invoice_drafts WHERE id = $1`, [draftId])
    expect(draft.rows[0].invoice_kind).toBe('single')
  })

  it('zálohový koncept se starou částkou se při schválení přepočítá z ceny', async () => {
    const id = await project(40000)
    const draftId = await createDraft('manual', {
      projectId: id,
      counterparty: { name: 'Kavárna U Mostu s.r.o.', address: 'Mostní 1, Praha', ico: '', dic: '' },
      email: 'kavarna@example.cz',
      items: [{ description: 'Nový web — záloha 30 %', quantity: 1, unitPrice: 9000, vatRate: 0 }],
      currency: 'CZK',
      dueDays: 14,
      suppliedOn: '',
      note: '',
      kind: 'deposit',
      percent: 30,
    })
    // Cena se mezitím změnila.
    await db.query(`UPDATE projects SET price = 50000 WHERE id = $1`, [id])
    const issued = await issueDraft(draftId)
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    const row = await invoiceRow(issued.invoiceId)
    expect(row).toMatchObject({ amount: 15000, invoice_kind: 'deposit', share_percent: 30 })
  })
})
