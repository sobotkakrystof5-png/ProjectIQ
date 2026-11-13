import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Co smí executor návrhu udělat (AD14, R-084).
 *
 * Testuje se hlavně to, co udělat **nesmí**: poslat zprávu, vystavit fakturu,
 * sáhnout na peníze nebo něco smazat. Server actions jsou podstrčené, takže
 * je vidět, co by se zavolalo — a co ne.
 */

const calls = {
  createLead: vi.fn(),
  addLeadNote: vi.fn(),
  addProjectNote: vi.fn(),
  createCalendarEvent: vi.fn(),
  setProjectStatus: vi.fn(),
}

vi.mock('@/app/calls-actions', () => ({
  createLead: (...args: unknown[]) => calls.createLead(...args),
  addLeadNote: (...args: unknown[]) => calls.addLeadNote(...args),
}))
vi.mock('@/app/calendar-actions', () => ({
  createCalendarEvent: (...args: unknown[]) => calls.createCalendarEvent(...args),
}))
vi.mock('@/app/actions', () => ({
  setProjectStatus: (...args: unknown[]) => calls.setProjectStatus(...args),
  undoProjectStatus: async () => {},
}))
vi.mock('@/app/project-notes-actions', () => ({
  addProjectNote: (...args: unknown[]) => calls.addProjectNote(...args),
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { applyProposal } from '@/lib/admin/suggestion-apply'
import { pgliteAdminDriver } from './helpers/admin-pglite'

let db: PGlite
let projectId: string

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      status text DEFAULT 'new',
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      contact_name text,
      created_at timestamptz DEFAULT now()
    );
  `)
  const res = await db.query<{ id: string }>(
    `INSERT INTO projects (client_name) VALUES ('Kavárna Ukázková') RETURNING id::text AS id`,
  )
  projectId = res.rows[0].id
  await db.query(`INSERT INTO projects (client_name) VALUES ('Jiná zakázka')`)
  await db.query(`INSERT INTO client_leads (company_name, contact_name) VALUES ('Novák s.r.o.', 'Jan Novák')`)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset()
  calls.createLead.mockResolvedValue({ id: 'lead-1', created_at: '2026-11-13' })
  calls.setProjectStatus.mockResolvedValue({ previousStatus: 'new' })
  calls.createCalendarEvent.mockResolvedValue(undefined)
  calls.addProjectNote.mockResolvedValue({ id: 'note-1' })
  calls.addLeadNote.mockResolvedValue({ id: 'note-2' })
})

describe('co executor nesmí', () => {
  it('zprávu jen připraví, neodešle ji', async () => {
    const out = await applyProposal({
      kind: 'send_message',
      channel: 'email',
      ref: { id: null, hint: null },
      phone: null,
      email: 'klient@example.cz',
      subject: 'Termín',
      body: 'Dobrý den, potvrzuji čtvrtek.',
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.ref.href?.startsWith('mailto:klient@example.cz?')).toBe(true)
    expect(out.description).toContain('Odeslání zůstává na vás')
    // Žádná odesílací cesta — ani e-mail, ani zápis.
    expect(calls.createLead).not.toHaveBeenCalled()
    expect(calls.addLeadNote).not.toHaveBeenCalled()
  })

  it('adresu, která by do zprávy propašovala parametr, odmítne', async () => {
    const out = await applyProposal({
      kind: 'send_message',
      channel: 'email',
      ref: { id: null, hint: null },
      phone: null,
      email: 'klient@example.cz?bcc=kdokoli@example.com',
      subject: null,
      body: 'Text',
    })
    expect(out).toEqual({ ok: false, error: 'Chybí použitelná e-mailová adresa.' })
  })

  it('fakturu nevystaví, jen otevře předvyplněný formulář', async () => {
    const out = await applyProposal({
      kind: 'create_invoice_draft',
      project: { id: projectId, hint: null },
      counterpartyName: 'Kavárna Ukázková',
      description: 'Web na míru',
      amount: 25000,
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.ref.href).toBe(`/dashboard/faktury/nova?zakazka=${projectId}`)
    expect(out.description).toContain('Nic se nevystavilo')
  })

  it('u „none" neudělá nic', async () => {
    const out = await applyProposal({ kind: 'none', reason: 'Nerozumím větě.' })
    expect(out.ok).toBe(false)
    for (const fn of Object.values(calls)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('dohledání záznamu', () => {
  it('nápověda, která sedí na jednu zakázku, stačí', async () => {
    const out = await applyProposal({
      kind: 'update_project_status',
      project: { id: null, hint: 'Kavárna' },
      status: 'done',
    })

    expect(out.ok).toBe(true)
    expect(calls.setProjectStatus).toHaveBeenCalledWith(projectId, 'done')
  })

  it('nápověda, která sedí na dvě zakázky, se neprovede', async () => {
    // Dvě firmy se stejným slovem v názvu: hádat, která to je, se nesmí.
    await db.query(`INSERT INTO projects (client_name) VALUES ('Pekárna u Nováků')`)
    await db.query(`INSERT INTO projects (client_name) VALUES ('Novákovi — chata')`)

    const out = await applyProposal({
      kind: 'update_project_status',
      project: { id: null, hint: 'Novák' },
      status: 'done',
    })

    expect(out).toEqual({
      ok: false,
      error: 'Nevíme, o kterou zakázku jde. Otevřete ji a zkuste to odtamtud.',
    })
    expect(calls.setProjectStatus).not.toHaveBeenCalled()
  })

  it('nápověda, která nesedí na nic, akci nespustí', async () => {
    const out = await applyProposal({
      kind: 'update_project_status',
      project: { id: null, hint: 'Firma, co neexistuje' },
      status: 'done',
    })

    expect(out.ok).toBe(false)
    expect(calls.setProjectStatus).not.toHaveBeenCalled()
  })

  it('vymyšlený identifikátor zakázky akci nespustí', async () => {
    const out = await applyProposal({
      kind: 'add_note',
      target: 'project',
      ref: { id: '11111111-1111-1111-1111-111111111111', hint: null },
      noteText: 'Poznámka.',
    })

    expect(out).toEqual({ ok: false, error: 'Nevíme, ke které zakázce poznámka patří.' })
    expect(calls.addProjectNote).not.toHaveBeenCalled()
  })
})

describe('co executor smí', () => {
  it('termín zapíše jako běžnou událost a dopočítá konec', async () => {
    const out = await applyProposal({
      kind: 'schedule_call',
      title: 'Hovor s Novákem',
      date: '2026-11-19',
      time: '14:00',
      durationMinutes: 45,
      contactName: 'Jan Novák',
      phone: '+420777123456',
      email: null,
      note: null,
    })

    expect(out.ok).toBe(true)
    const payload = calls.createCalendarEvent.mock.calls[0][0]
    expect(payload.event_type).toBe('manual')
    expect(payload.contact_name).toBe('Jan Novák')
    const minutes = (new Date(payload.ends_at).getTime() - new Date(payload.starts_at).getTime()) / 60_000
    expect(minutes).toBe(45)
  })

  it('termín bez data se nezapíše', async () => {
    const out = await applyProposal({
      kind: 'schedule_call',
      title: 'Hovor',
      date: null,
      time: '14:00',
      durationMinutes: 60,
      contactName: null,
      phone: null,
      email: null,
      note: null,
    })

    expect(out).toEqual({ ok: false, error: 'Chybí datum nebo čas — doplňte je a zkuste to znovu.' })
    expect(calls.createCalendarEvent).not.toHaveBeenCalled()
  })

  it('nový kontakt jde do Hovorů přes tutéž akci jako formulář', async () => {
    const out = await applyProposal({
      kind: 'create_lead',
      companyName: 'Zámečnictví Dvořák',
      contactName: 'Petr Dvořák',
      phone: '+420608111222',
      email: null,
      note: 'Shánějí nový web.',
    })

    expect(out.ok).toBe(true)
    const payload = calls.createLead.mock.calls[0][0]
    expect(payload.company_name).toBe('Zámečnictví Dvořák')
    expect(payload.notes).toBe('Shánějí nový web.')
    // Teplotu kontaktu model neurčuje.
    expect(payload.lead_status).toBe('warm')
  })
})
