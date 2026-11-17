import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Co asistent provede a jak to vrátí (AD14, R-111).
 *
 * Testuje se hlavně to, co udělat **nesmí**: poslat zprávu, vystavit
 * neúplnou fakturu, hádat mezi dvěma zakázkami, smazat zakázku s penězi.
 * Server actions jsou podstrčené, takže je vidět, co by se zavolalo — a co ne.
 * Dohledání záznamů běží proti skutečnému Postgresu (PGlite).
 */

const { calls, proxy } = vi.hoisted(() => {
  const calls = {

  createLead: vi.fn(),
  deleteLead: vi.fn(),
  addLeadNote: vi.fn(),
  deleteLeadNote: vi.fn(),
  addProjectNote: vi.fn(),
  deleteProjectNote: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  restoreCalendarEvent: vi.fn(),
  setProjectStatus: vi.fn(),
  undoProjectStatus: vi.fn(),
  addBusinessIncome: vi.fn(),
  deleteBusinessIncome: vi.fn(),
  createCost: vi.fn(),
  deleteCost: vi.fn(),
  setInvoicePaid: vi.fn(),
  issueNewInvoice: vi.fn(),
  cancelIssuedInvoice: vi.fn(),
  loadIssueDraft: vi.fn(),
  loadIssuerProfile: vi.fn(),
  updateLead: vi.fn(),
  saveMemory: vi.fn(),
  discardMemory: vi.fn(),
  createDraft: vi.fn(),
  deleteAssistantDraft: vi.fn(),
  }
  const proxy =
    (name: keyof typeof calls) =>
    (...args: unknown[]) =>
      calls[name](...args)
  return { calls, proxy }
})

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/app/calls-actions', () => ({
  createLead: proxy('createLead'),
  deleteLead: proxy('deleteLead'),
  addLeadNote: proxy('addLeadNote'),
  deleteLeadNote: proxy('deleteLeadNote'),
  updateLead: proxy('updateLead'),
}))
vi.mock('@/lib/admin/memory/store', () => ({
  saveMemory: proxy('saveMemory'),
  discardMemory: proxy('discardMemory'),
}))
vi.mock('@/lib/auth', () => ({ adminActorEmail: async () => 'admin@example.cz' }))
vi.mock('@/app/calendar-actions', () => ({
  createCalendarEvent: proxy('createCalendarEvent'),
  updateCalendarEvent: proxy('updateCalendarEvent'),
  deleteCalendarEvent: proxy('deleteCalendarEvent'),
  restoreCalendarEvent: proxy('restoreCalendarEvent'),
}))
vi.mock('@/app/actions', () => ({
  setProjectStatus: proxy('setProjectStatus'),
  undoProjectStatus: proxy('undoProjectStatus'),
}))
vi.mock('@/app/project-notes-actions', () => ({
  addProjectNote: proxy('addProjectNote'),
  deleteProjectNote: proxy('deleteProjectNote'),
}))
vi.mock('@/app/dashboard/finance/business-income-actions', () => ({
  addBusinessIncome: proxy('addBusinessIncome'),
  deleteBusinessIncome: proxy('deleteBusinessIncome'),
}))
vi.mock('@/app/costs-actions', () => ({
  createCost: proxy('createCost'),
  deleteCost: proxy('deleteCost'),
}))
vi.mock('@/app/dashboard/finance/invoice-actions', () => ({
  setInvoicePaid: proxy('setInvoicePaid'),
  issueNewInvoice: proxy('issueNewInvoice'),
  cancelIssuedInvoice: proxy('cancelIssuedInvoice'),
}))
vi.mock('@/lib/admin/invoice-issue', () => ({
  loadIssueDraft: proxy('loadIssueDraft'),
  loadIssuerProfile: proxy('loadIssuerProfile'),
}))
vi.mock('@/lib/admin/invoice-drafts', () => ({
  createDraft: proxy('createDraft'),
  deleteAssistantDraft: proxy('deleteAssistantDraft'),
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { runAction, undoStep } from '@/lib/admin/suggestion-apply'
import { nameCandidates } from '@/lib/admin/assistant-resolve'
import { actionClass, autoRunIndexes } from '@/lib/ai/action-policy'
import type { Action, Suggestion } from '@/lib/ai/suggestion-schema'
import { pgliteAdminDriver } from './helpers/admin-pglite'

let db: PGlite
let projectId: string
let invoiceId: string

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      client_email text, client_phone text, service_type text, description text,
      status text DEFAULT 'new', progress int DEFAULT 0, price numeric, paid boolean DEFAULT false,
      deadline date, deposit_paid boolean DEFAULT false, lead_origin text, invoiced_on_ico boolean DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      contact_name text, phone text, email text,
      calendar_event_id uuid,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL, description text,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      event_type text NOT NULL
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_project_id uuid
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text NOT NULL, client_name text, project_id uuid,
      issued_on date DEFAULT now(), paid_on date, cancelled_at timestamptz
    );
  `)
  const res = await db.query<{ id: string }>(
    `INSERT INTO projects (client_name) VALUES ('Kavárna Ukázková') RETURNING id::text AS id`,
  )
  projectId = res.rows[0].id
  await db.query(`INSERT INTO projects (client_name) VALUES ('Jiná zakázka')`)
  await db.query(`INSERT INTO client_leads (company_name, contact_name, phone) VALUES ('Novák s.r.o.', 'Jan Novák', '+420777123456')`)
  const inv = await db.query<{ id: string }>(
    `INSERT INTO invoices (invoice_number, client_name, project_id) VALUES ('2026014', 'Kavárna Ukázková', $1) RETURNING id::text AS id`,
    [projectId],
  )
  invoiceId = inv.rows[0].id
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset()
  calls.createLead.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', created_at: '2026-11-16' })
  calls.setProjectStatus.mockResolvedValue({ previousStatus: 'new' })
  calls.createCalendarEvent.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' })
  calls.addProjectNote.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' })
  calls.addLeadNote.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' })
  calls.addBusinessIncome.mockResolvedValue({ ok: true, id: '55555555-5555-4555-8555-555555555555' })
  calls.deleteBusinessIncome.mockResolvedValue({ ok: true, id: '55555555-5555-4555-8555-555555555555' })
  calls.setInvoicePaid.mockResolvedValue({})
  calls.loadIssuerProfile.mockResolvedValue({ configured: true, profile: { vatPayer: false } })
})

const ref = (hint: string | null, id: string | null = null) => ({ id, hint })

describe('co asistent nesmí', () => {
  it('zprávu jen připraví, neodešle ji', async () => {
    const out = await runAction({
      kind: 'send_message',
      channel: 'email',
      ref: ref(null),
      phone: null,
      email: 'klient@example.cz',
      subject: 'Termín',
      body: 'Dobrý den, potvrzuji čtvrtek.',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.href?.startsWith('mailto:klient@example.cz?')).toBe(true)
    expect(out.undo).toBeNull()
  })

  it('adresu, která by do zprávy propašovala parametr, odmítne', async () => {
    const out = await runAction({
      kind: 'send_message',
      channel: 'email',
      ref: ref(null),
      phone: null,
      email: 'klient@example.cz?bcc=kdokoli@example.com',
      subject: null,
      body: 'Text',
    })
    expect(out).toEqual({ ok: false, error: 'Chybí e-mailová adresa.' })
  })

  it('fakturu nevystaví, připraví koncept — i když chybí adresa', async () => {
    calls.loadIssueDraft.mockResolvedValue({
      issuedOn: '2026-11-16', suppliedOn: '2026-11-16', dueOn: '2026-11-30',
      counterparty: { name: 'Kavárna Ukázková', address: '', ico: '', dic: '' },
      email: '', amount: 25000, projectId, projectLabel: 'Kavárna', items: [],
    })
    calls.loadIssuerProfile.mockResolvedValue({ profile: { vatPayer: false }, configured: true })
    calls.createDraft.mockResolvedValue(invoiceId)
    const out = await runAction({
      kind: 'issue_invoice',
      project: ref(null, projectId),
      counterpartyName: null,
      description: 'Web na míru',
      amount: null,
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(calls.issueNewInvoice).not.toHaveBeenCalled()
    expect(out.undo).toEqual({ type: 'invoice_draft', id: invoiceId })
    expect(out.href).toBe('/dashboard/faktury')
    expect(out.description).toContain('adresa odběratele')
    const [source, fields] = calls.createDraft.mock.calls[0]
    expect(source).toBe('assistant')
    expect(fields.projectId).toBe(projectId)
    expect(fields.items).toEqual([{ description: 'Web na míru', quantity: 1, unitPrice: 25000, vatRate: 0 }])
  })

  it('„Zpět" koncept od asistenta smaže', async () => {
    calls.deleteAssistantDraft.mockResolvedValue(true)
    expect(await undoStep({ type: 'invoice_draft', id: invoiceId })).toEqual({ ok: true })
    calls.deleteAssistantDraft.mockResolvedValue(false)
    expect((await undoStep({ type: 'invoice_draft', id: invoiceId })).ok).toBe(false)
  })

  it('zakázku, ke které už přišly peníze, „Zpět" nesmaže', async () => {
    const res = await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Nová od asistenta') RETURNING id::text AS id`)
    const id = res.rows[0].id
    await db.query(`INSERT INTO finance_transactions (source_project_id) VALUES ($1)`, [id])
    const out = await undoStep({ type: 'project', id })
    expect(out.ok).toBe(false)
    const still = await db.query(`SELECT 1 FROM projects WHERE id = $1`, [id])
    expect(still.rows.length).toBe(1)
  })
})

describe('dohledání záznamu', () => {
  it('nápověda, která sedí na jednu zakázku, stačí', async () => {
    const out = await runAction({ kind: 'update_project_status', project: ref('Kavárna'), status: 'review' })
    expect(out.ok).toBe(true)
    expect(calls.setProjectStatus).toHaveBeenCalledWith(projectId, 'review')
  })

  it('skloněné jméno z diktování najde i tak („Kavárny")', async () => {
    const out = await runAction({ kind: 'update_project_status', project: ref('Kavárny'), status: 'review' })
    expect(out.ok).toBe(true)
    expect(calls.setProjectStatus).toHaveBeenCalledWith(projectId, 'review')
  })

  it('nápověda, která sedí na dvě zakázky, se neprovede', async () => {
    await db.query(`INSERT INTO projects (client_name) VALUES ('Pekárna u Nováků'), ('Novákovi chata')`)
    const out = await runAction({ kind: 'update_project_status', project: ref('Novák'), status: 'review' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.error).toContain('je víc')
    expect(calls.setProjectStatus).not.toHaveBeenCalled()
  })

  it('vymyšlený identifikátor nic nespustí', async () => {
    const out = await runAction({
      kind: 'add_note',
      target: 'project',
      ref: ref(null, '99999999-9999-4999-8999-999999999999'),
      noteText: 'Poznámka.',
    })
    expect(out.ok).toBe(false)
    expect(calls.addProjectNote).not.toHaveBeenCalled()
  })

  it('fakturu najde podle čísla i nadiktovaného s mezerou', async () => {
    const out = await runAction({ kind: 'mark_invoice_paid', invoice: ref('2026 014'), paidOn: '2026-11-16' })
    expect(out.ok).toBe(true)
    expect(calls.setInvoicePaid).toHaveBeenCalledWith(invoiceId, '2026-11-16')
    if (out.ok) expect(out.undo).toEqual({ type: 'invoice_paid', id: invoiceId, previousPaidOn: null })
  })

  it('varianty jména: přesně, pak kořen bez koncovky', () => {
    expect(nameCandidates('Nováka')).toEqual(['Nováka', 'Novák'])
    expect(nameCandidates('Novákovi')).toEqual(['Novákovi', 'Novák'])
    expect(nameCandidates('Jan')).toEqual(['Jan'])
    expect(nameCandidates('  ')).toEqual([])
  })
})

describe('co asistent udělá a jak to vrátí', () => {
  it('termín zapíše jako běžnou událost, dopočítá konec a umí ho vrátit', async () => {
    const out = await runAction({
      kind: 'schedule_event',
      title: 'Schůzka s Novákem',
      date: '2026-11-19',
      time: '14:00',
      durationMinutes: 45,
      contactName: 'Jan Novák',
      phone: null,
      email: null,
      note: null,
    })
    expect(out.ok).toBe(true)
    const payload = calls.createCalendarEvent.mock.calls[0][0]
    expect(payload.event_type).toBe('manual')
    expect((new Date(payload.ends_at).getTime() - new Date(payload.starts_at).getTime()) / 60_000).toBe(45)
    if (!out.ok || !out.undo) throw new Error('chybí zpět')
    await undoStep(out.undo)
    expect(calls.deleteCalendarEvent).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
  })

  it('termín bez dne se nezapíše', async () => {
    const out = await runAction({
      kind: 'schedule_event', title: 'Hovor', date: null, time: '14:00', durationMinutes: 60,
      contactName: null, phone: null, email: null, note: null,
    })
    expect(out).toEqual({ ok: false, error: 'Chybí den nebo čas termínu.' })
    expect(calls.createCalendarEvent).not.toHaveBeenCalled()
  })

  it('nový kontakt jde do Hovorů přes tutéž akci jako formulář', async () => {
    const out = await runAction({
      kind: 'create_contact', companyName: 'Zámečnictví Dvořák', contactName: 'Petr Dvořák',
      phone: '+420608111222', email: null, note: 'Shánějí nový web.',
    })
    expect(out.ok).toBe(true)
    const payload = calls.createLead.mock.calls[0][0]
    expect(payload.company_name).toBe('Zámečnictví Dvořák')
    expect(payload.lead_status).toBe('warm')
  })

  it('záloha jde k dohledané zakázce a „Zpět" ji smaže', async () => {
    const out = await runAction({
      kind: 'add_payment', paymentType: 'zaloha', project: ref('Kavárna'), amount: 5000, date: null, note: null,
    })
    expect(out.ok).toBe(true)
    const input = calls.addBusinessIncome.mock.calls[0][0]
    expect(input).toMatchObject({ kind: 'zaloha', amount: 5000, projectId })
    expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    if (!out.ok || !out.undo) throw new Error('chybí zpět')
    expect((await undoStep(out.undo)).ok).toBe(true)
    expect(calls.deleteBusinessIncome).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555')
  })

  it('záloha bez částky se nezapíše', async () => {
    const out = await runAction({
      kind: 'add_payment', paymentType: 'zaloha', project: ref('Kavárna'), amount: null, date: null, note: null,
    })
    expect(out.ok).toBe(false)
    expect(calls.addBusinessIncome).not.toHaveBeenCalled()
  })

  it('změna stavu se vrací na předchozí stav', async () => {
    const out = await runAction({ kind: 'update_project_status', project: ref(null, projectId), status: 'in_progress' })
    if (!out.ok || !out.undo) throw new Error('chybí zpět')
    await undoStep(out.undo)
    expect(calls.undoProjectStatus).toHaveBeenCalledWith(projectId, 'new')
  })

  it('zakázku založí bez e-mailu klientovi a bez peněz ji „Zpět" smaže', async () => {
    const out = await runAction({
      kind: 'create_project', clientName: 'Pekařství Horák', clientEmail: 'horak@example.cz', clientPhone: null,
      serviceType: 'web', description: null, price: 30000, deadline: null,
    })
    expect(out.ok).toBe(true)
    if (!out.ok || !out.undo) throw new Error('chybí zpět')
    const created = await db.query(`SELECT status FROM projects WHERE client_name = 'Pekařství Horák'`)
    expect(created.rows).toEqual([{ status: 'new' }])
    expect((await undoStep(out.undo)).ok).toBe(true)
    const gone = await db.query(`SELECT 1 FROM projects WHERE client_name = 'Pekařství Horák'`)
    expect(gone.rows.length).toBe(0)
  })
})

describe('co se provede samo (R-111)', () => {
  const plan = (actions: Action[], confidence = 0.9): Suggestion => ({
    actions,
    reply: '',
    confidence,
    assumptions: [],
    missing: [],
  })
  const contact: Action = { kind: 'create_contact', companyName: 'X', contactName: null, phone: null, email: null, note: null }
  const invoice: Action = { kind: 'issue_invoice', project: null, counterpartyName: null, description: null, amount: null }
  const done: Action = { kind: 'update_project_status', project: { id: null, hint: 'X' }, status: 'done' }

  it('vratné akce ano (i koncept faktury), storno, zpráva a „Hotovo" čekají', () => {
    expect(actionClass(contact)).toBe('auto')
    expect(actionClass(invoice)).toBe('auto')
    expect(actionClass({ kind: 'cancel_invoice', invoice: { id: null, hint: '1' } })).toBe('confirm')
    expect(actionClass(done)).toBe('confirm')
    expect(actionClass({ ...done, status: 'in_progress' } as Action)).toBe('auto')
    expect(autoRunIndexes({ suggestion: plan([contact, done, contact]), untrustedContext: false })).toEqual([0, 2])
  })

  it('s textem od klienta v kontextu se nic neprovede samo', () => {
    expect(autoRunIndexes({ suggestion: plan([contact]), untrustedContext: true })).toEqual([])
  })

  it('při nízké jistotě se nic neprovede samo', () => {
    expect(autoRunIndexes({ suggestion: plan([contact], 0.4), untrustedContext: false })).toEqual([])
  })
})

describe('úpravy a paměť (R-113)', () => {
  beforeAll(async () => {
    await db.exec(`
      ALTER TABLE client_leads
        ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'warm',
        ADD COLUMN IF NOT EXISTS next_action text,
        ADD COLUMN IF NOT EXISTS next_action_date date,
        ADD COLUMN IF NOT EXISTS next_action_time time,
        ADD COLUMN IF NOT EXISTS next_action_type text,
        ADD COLUMN IF NOT EXISTS notes text,
        ADD COLUMN IF NOT EXISTS estimated_value numeric,
        ADD COLUMN IF NOT EXISTS call_answered boolean;
    `)
  })

  it('úprava zakázky změní jen řečené a „Zpět" vrátí původní', async () => {
    await db.query(`UPDATE projects SET price = 20000, client_phone = '+420600000000' WHERE id = $1`, [projectId])
    const out = await runAction({
      kind: 'update_project',
      project: ref(null, projectId),
      clientName: null,
      clientEmail: null,
      clientPhone: null,
      serviceType: null,
      description: null,
      price: 25000,
      deadline: '2026-12-15',
    })
    expect(out.ok).toBe(true)
    if (!out.ok || !out.undo) throw new Error('chybí Zpět')
    let row = (await db.query<{ price: string; deadline: string; client_phone: string }>(
      `SELECT price::text, deadline::text, client_phone FROM projects WHERE id = $1`,
      [projectId],
    )).rows[0]
    expect(row).toEqual({ price: '25000', deadline: '2026-12-15', client_phone: '+420600000000' })

    expect(await undoStep(out.undo)).toEqual({ ok: true })
    row = (await db.query<{ price: string; deadline: string; client_phone: string }>(
      `SELECT price::text, deadline::text, client_phone FROM projects WHERE id = $1`,
      [projectId],
    )).rows[0]
    expect(row.price).toBe('20000')
    expect(row.deadline).toBeNull()
  })

  it('úprava kontaktu jde přes updateLead se sloučenými údaji', async () => {
    calls.updateLead.mockResolvedValue({})
    const out = await runAction({
      kind: 'update_contact',
      ref: ref('Novák'),
      companyName: null,
      contactName: null,
      phone: '+420777999888',
      email: null,
      leadStatus: 'hot',
      nextAction: null,
      nextActionDate: null,
      nextActionTime: null,
      nextActionType: null,
      estimatedValue: null,
    })
    expect(out.ok).toBe(true)
    const [, payload] = calls.updateLead.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toMatchObject({ company_name: 'Novák s.r.o.', contact_name: 'Jan Novák', phone: '+420777999888', lead_status: 'hot' })
    if (!out.ok || !out.undo) throw new Error('chybí Zpět')
    await undoStep(out.undo)
    const [, before] = calls.updateLead.mock.calls[1] as [string, Record<string, unknown>]
    expect(before).toMatchObject({ phone: '+420777123456', lead_status: 'warm' })
  })

  it('paměť uloží potvrzenou a „Zpět" ji zahodí', async () => {
    calls.saveMemory.mockResolvedValue({ ok: true, id: '66666666-6666-4666-8666-666666666666' })
    calls.discardMemory.mockResolvedValue(true)
    const out = await runAction({ kind: 'remember', scope: 'global', project: null, memoryKind: 'preference', text: 'Schůzky jen odpoledne.' })
    expect(out.ok).toBe(true)
    expect(calls.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'global', refId: null, kind: 'preference', source: 'assistant', confirmedBy: 'admin@example.cz' }),
    )
    if (!out.ok || !out.undo) throw new Error('chybí Zpět')
    expect(await undoStep(out.undo)).toEqual({ ok: true })
    expect(calls.discardMemory).toHaveBeenCalledWith('66666666-6666-4666-8666-666666666666')
  })
})
