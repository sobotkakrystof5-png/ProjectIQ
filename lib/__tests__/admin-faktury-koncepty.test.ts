import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Koncepty faktur a pravidelné faktury (R-117) proti skutečnému Postgresu.
 *
 * Co se slibuje: hotová zakázka připraví koncept **jednou**, pravidelná
 * faktura **jednou za měsíc**, koncept dostane číslo až při schválení
 * a jeden koncept nikdy nevyrobí dvě faktury.
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
import { loadIssueDraft, resetIssuingReadyForTests, saveIssuerProfile } from '@/lib/admin/invoice-issue'
import type { IssuerProfile } from '@/lib/admin/invoice-issue-schema'
import {
  createDraft,
  deleteAssistantDraft,
  dismissDraft,
  getDraft,
  issueDraft,
  listOpenDrafts,
  prepareProjectDoneDraft,
  prepareRecurringDrafts,
  resetDraftsReadyForTests,
  restoreDraft,
  saveRecurring,
} from '@/lib/admin/invoice-drafts'
import { draftGaps, type DraftFields } from '@/lib/admin/invoice-draft-schema'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const ISSUER: IssuerProfile = {
  name: 'Kryštof Sobotka',
  address: 'Kamenice 64, 294 04 Dobšín',
  ico: '29977231',
  dic: '',
  bank: 'CZ6508000000192000145399',
  email: 'info@example.cz',
  vatPayer: false,
  tradeName: 'VIZEON',
  registry: 'Fyzická osoba zapsaná v živnostenském rejstříku',
  phone: '',
  web: '',
}

const fields = (over: Partial<DraftFields> = {}): DraftFields => ({
  projectId: null,
  counterparty: { name: 'Klient s.r.o.', address: 'Dlouhá 1, Praha', ico: '', dic: '' },
  email: 'klient@example.cz',
  items: [{ description: 'Web na míru', quantity: 1, unitPrice: 12000, vatRate: 0 }],
  currency: 'CZK',
  dueDays: 14,
  suppliedOn: '',
  note: '',
  ...over,
})

async function project(over: Record<string, unknown> = {}): Promise<string> {
  const row = {
    client_name: 'Kavárna Ukázková',
    client_email: 'kavarna@example.cz',
    description: 'Nový web',
    price: 30000,
    deposit_amount: 10000,
    deposit_paid: true,
    status: 'done',
    project_type: 'client',
    ...over,
  }
  const keys = Object.keys(row)
  const res = await db.query<{ id: string }>(
    `INSERT INTO projects (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id::text AS id`,
    Object.values(row),
  )
  return res.rows[0].id
}

async function draftRow(id: string) {
  const res = await db.query<{ status: string; invoice_id: string | null }>(
    `SELECT status, invoice_id::text FROM invoice_drafts WHERE id = $1`,
    [id],
  )
  return res.rows[0]
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
  const migration = read('117_faktury_koncepty.sql')
  await db.exec(migration)
  // Idempotence: druhý běh nesmí spadnout.
  await db.exec(migration)

  setAdminDbForTests(pgliteAdminDriver(db))
  resetIssuingReadyForTests()
  resetDraftsReadyForTests()
  await saveIssuerProfile(ISSUER)
})

beforeEach(async () => {
  await db.exec(`DELETE FROM invoice_drafts; DELETE FROM invoice_recurring;`)
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

describe('co v konceptu chybí', () => {
  it('úplný koncept nic nehlásí', () => {
    expect(draftGaps(fields())).toEqual([])
  })

  it('pozná chybějící adresu, e-mail a položku', () => {
    expect(
      draftGaps(fields({ counterparty: { name: 'X', address: '', ico: '', dic: '' }, email: '', items: [] })),
    ).toEqual(['adresa odběratele', 'e-mail, kam fakturu poslat', 'položka s popisem'])
  })

  it('položka s nulovou cenou není hotová', () => {
    expect(draftGaps(fields({ items: [{ description: 'Web', quantity: 1, unitPrice: 0, vatRate: 0 }] }))).toEqual(['cena'])
  })
})

describe('hotová zakázka připraví koncept', () => {
  it('na doplatek, s e-mailem ze zakázky, a jen jednou', async () => {
    const id = await project()
    const draftId = await prepareProjectDoneDraft(id)
    expect(draftId).not.toBeNull()

    const draft = await getDraft(draftId!)
    expect(draft?.source).toBe('project_done')
    expect(draft?.email).toBe('kavarna@example.cz')
    expect(draft?.total).toBe(20000)
    expect(draft?.items[0]).toMatchObject({ description: 'Nový web', unitPrice: 20000, vatRate: 0 })
    // Bez adresy to není hotové — dashboard to řekne, nic neodejde.
    expect(draft?.gaps).toContain('adresa odběratele')

    expect(await prepareProjectDoneDraft(id)).toBeNull()
  })

  it('zahozený koncept se po další změně stavu nevrátí', async () => {
    const id = await project()
    const draftId = await prepareProjectDoneDraft(id)
    expect(await dismissDraft(draftId!)).toBe(true)
    expect(await prepareProjectDoneDraft(id)).toBeNull()
  })

  it('ne u vlastního projektu, nehotové zakázky, zaplacené ani bez doplatku', async () => {
    expect(await prepareProjectDoneDraft(await project({ project_type: 'personal' }))).toBeNull()
    expect(await prepareProjectDoneDraft(await project({ status: 'in_progress' }))).toBeNull()
    expect(await prepareProjectDoneDraft(await project({ status: 'paid' }))).toBeNull()
    expect(await prepareProjectDoneDraft(await project({ price: 10000 }))).toBeNull()
  })

  it('ne u hotové zakázky se zaškrtnutým „Peníze dorazily" bez faktury (audit #4)', async () => {
    const id = await project({ paid: true })
    expect(await prepareProjectDoneDraft(id)).toBeNull()
    // Ani formulář nové faktury nenabídne celou cenu znovu.
    expect((await loadIssueDraft(id)).amount).toBe(0)
  })

  it('ne, když už k zakázce existuje platná faktura', async () => {
    const id = await project()
    await db.query(`INSERT INTO invoices (invoice_number, issued_on, amount, project_id) VALUES ('cizi-1', '2026-11-01', 5000, $1)`, [id])
    expect(await prepareProjectDoneDraft(id)).toBeNull()
  })
})

describe('schválení: vystavit', () => {
  it('neúplný koncept nevystaví a nechá ho čekat', async () => {
    const id = await createDraft('manual', fields({ counterparty: { name: 'X', address: '', ico: '', dic: '' } }))
    const out = await issueDraft(id)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.error).toContain('adresa odběratele')
    expect(out.editHref).toBe(`/dashboard/faktury/nova?koncept=${id}`)
    expect((await draftRow(id)).status).toBe('draft')
  })

  it('úplný koncept dostane číslo, e-mail se zapíše na fakturu', async () => {
    const id = await createDraft('manual', fields())
    const out = await issueDraft(id, 'jiny@example.cz')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.number).toMatch(/^\d{7}$/)
    expect(out.email).toBe('jiny@example.cz')

    const row = await draftRow(id)
    expect(row).toEqual({ status: 'issued', invoice_id: out.invoiceId })
    const inv = await db.query<{ amount: string; client_email: string; number_seq: number }>(
      `SELECT amount, client_email, number_seq FROM invoices WHERE id = $1`,
      [out.invoiceId],
    )
    expect(Number(inv.rows[0].amount)).toBe(12000)
    expect(inv.rows[0].client_email).toBe('jiny@example.cz')
  })

  it('druhé kliknutí nevyrobí druhou fakturu', async () => {
    const id = await createDraft('manual', fields())
    expect((await issueDraft(id)).ok).toBe(true)
    const before = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE number_seq IS NOT NULL`)
    const again = await issueDraft(id)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.status).toBe(409)
    const after = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE number_seq IS NOT NULL`)
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })

  it('koncept zaseknutý ve „sending" se po pěti minutách dá vystavit', async () => {
    const id = await createDraft('manual', fields())
    await db.query(`UPDATE invoice_drafts SET status = 'sending', updated_at = now() - interval '10 minutes' WHERE id = $1`, [id])
    expect((await listOpenDrafts()).map(d => d.id)).toContain(id)
    expect((await issueDraft(id)).ok).toBe(true)
  })

  it('čerstvě zamčený koncept nikdo jiný nevystaví', async () => {
    const id = await createDraft('manual', fields())
    await db.query(`UPDATE invoice_drafts SET status = 'sending' WHERE id = $1`, [id])
    const out = await issueDraft(id)
    expect(out.ok).toBe(false)
  })
})

describe('zahodit, vrátit, Zpět u asistenta', () => {
  it('zahozený koncept zmizí ze seznamu a Zpět ho vrátí', async () => {
    const id = await createDraft('manual', fields())
    await dismissDraft(id)
    expect((await listOpenDrafts()).map(d => d.id)).not.toContain(id)
    expect(await restoreDraft(id)).toBe(true)
    expect((await listOpenDrafts()).map(d => d.id)).toContain(id)
  })

  it('„Zpět" asistenta smaže jen jeho koncept', async () => {
    const mine = await createDraft('assistant', fields())
    const manual = await createDraft('manual', fields())
    expect(await deleteAssistantDraft(manual)).toBe(false)
    expect(await deleteAssistantDraft(mine)).toBe(true)
    expect(await getDraft(mine)).toBeNull()
  })
})

describe('pravidelné faktury', () => {
  const recurring = {
    label: 'Správa webu',
    projectId: null,
    counterparty: { name: 'Kavárna', address: 'Hlavní 1, Praha', ico: '', dic: '' },
    email: 'kavarna@example.cz',
    items: [{ description: 'Správa webu', quantity: 1, unitPrice: 1500, vatRate: 0 as const }],
    currency: 'CZK' as const,
    dueDays: 14,
    dayOfMonth: 5,
  }

  it('připraví koncept od svého dne, jednou za měsíc', async () => {
    const id = await saveRecurring(null, recurring)
    await db.query(`UPDATE invoice_recurring SET created_at = '2026-10-01T10:00:00Z' WHERE id = $1`, [id])

    expect(await prepareRecurringDrafts('2026-12-04')).toBe(0)
    expect(await prepareRecurringDrafts('2026-12-05')).toBe(1)
    expect(await prepareRecurringDrafts('2026-12-20')).toBe(0)

    const [draft] = await listOpenDrafts()
    expect(draft).toMatchObject({ source: 'recurring', period: '2026-12', total: 1500, email: 'kavarna@example.cz' })
    expect(draft.note).toBe('Za období prosinec 2026.')
    expect(draft.gaps).toEqual([])

    // Zahozený měsíc se nevrací, další měsíc přijde nový.
    await dismissDraft(draft.id)
    expect(await prepareRecurringDrafts('2026-12-21')).toBe(0)
    expect(await prepareRecurringDrafts('2027-01-06')).toBe(1)
  })

  it('šablona založená po svém dni začne až příštím měsícem', async () => {
    const id = await saveRecurring(null, recurring)
    await db.query(`UPDATE invoice_recurring SET created_at = '2026-11-17T10:00:00Z' WHERE id = $1`, [id])
    expect(await prepareRecurringDrafts('2026-11-18')).toBe(0)
    expect(await prepareRecurringDrafts('2026-12-05')).toBe(1)
  })

  it('pozastavená nepřipraví nic', async () => {
    const id = await saveRecurring(null, recurring)
    await db.query(`UPDATE invoice_recurring SET created_at = '2026-10-01T10:00:00Z', active = false WHERE id = $1`, [id])
    expect(await prepareRecurringDrafts('2026-12-05')).toBe(0)
  })
})
