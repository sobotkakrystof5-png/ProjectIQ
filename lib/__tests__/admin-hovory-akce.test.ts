import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Serverová akce „Poslat e-mail" z Hovorů (R-121): vstup se ověřuje na
 * serveru, adresát je vždy e-mail uloženého kontaktu a záznam o odeslání se
 * zapíše jen tehdy, když e-mail opravdu odešel.
 */

vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendPlainEmail: vi.fn(async () => true) }))
vi.mock('@/lib/admin/lead-meeting', () => ({ sendLeadMeetingEmail: vi.fn() }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { requireAuth } from '@/lib/auth'
import { sendPlainEmail } from '@/lib/email'
import { sendLeadMeetingEmail } from '@/lib/admin/lead-meeting'
import { sendLeadEmail } from '@/app/lead-mail-actions'
import { pgliteAdminDriver } from './helpers/admin-pglite'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, email text,
      portfolio_sent_at timestamptz
    );
    CREATE TABLE lead_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES client_leads(id) ON DELETE CASCADE,
      content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(() => setAdminDbForTests(null))

beforeEach(async () => {
  await db.exec('DELETE FROM lead_notes; DELETE FROM client_leads;')
  vi.clearAllMocks()
  vi.mocked(sendPlainEmail).mockResolvedValue(true)
})

async function lead(email: string | null = 'jan@example.cz'): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO client_leads (company_name, email) VALUES ('Firma Ukázková', $1) RETURNING id::text AS id`,
    [email],
  )
  return res.rows[0].id
}

const valid = (leadId: string, over: Record<string, unknown> = {}) => ({
  template: 'nabidka',
  leadId,
  subject: 'Nabídka na tvorbu webu - Kryštof Sobotka',
  body: 'Dobrý den,\n\nposílám nabídku.',
  ...over,
})

describe('sendLeadEmail', () => {
  it('pošle e-mail na adresu uloženého kontaktu a zapíše to do historie', async () => {
    const id = await lead()
    const result = await sendLeadEmail(valid(id))

    expect(result).toEqual({ ok: true, message: 'E-mail odeslán.' })
    expect(requireAuth).toHaveBeenCalled()
    expect(sendPlainEmail).toHaveBeenCalledWith({
      to: 'jan@example.cz',
      subject: 'Nabídka na tvorbu webu - Kryštof Sobotka',
      text: 'Dobrý den,\n\nposílám nabídku.',
    })
    const row = await db.query<{ sent: boolean }>(`SELECT portfolio_sent_at IS NOT NULL AS sent FROM client_leads WHERE id = $1`, [id])
    expect(row.rows[0].sent).toBe(true)
    const note = await db.query<{ content: string }>(`SELECT content FROM lead_notes WHERE lead_id = $1`, [id])
    expect(note.rows[0].content).toContain('Nabídka na tvorbu webu')
  })

  it('adresát z prohlížeče se nebere: pole `to` se ignoruje', async () => {
    const id = await lead()
    await sendLeadEmail(valid(id, { to: 'cizi@example.com' }))
    expect(vi.mocked(sendPlainEmail).mock.calls[0]![0].to).toBe('jan@example.cz')
  })

  it('když e-mail neodejde, nic se do historie nezapíše', async () => {
    const id = await lead()
    vi.mocked(sendPlainEmail).mockResolvedValue(false)

    const result = await sendLeadEmail(valid(id))
    expect(result.ok).toBe(false)
    expect((await db.query(`SELECT 1 FROM lead_notes`)).rows).toHaveLength(0)
    expect((await db.query<{ sent: boolean }>(`SELECT portfolio_sent_at IS NOT NULL AS sent FROM client_leads`)).rows[0].sent).toBe(false)
  })

  it('odmítne kontakt bez e-mailu, neexistující kontakt a nedopsané místo v závorkách', async () => {
    const bez = await lead(null)
    expect(await sendLeadEmail(valid(bez))).toEqual({ ok: false, error: 'Kontakt nemá vyplněný e-mail.' })
    expect(await sendLeadEmail(valid('00000000-0000-0000-0000-000000000000'))).toEqual({
      ok: false,
      error: 'Kontakt nenalezen.',
    })

    const id = await lead()
    const rozepsane = await sendLeadEmail(valid(id, { body: 'Dobrý den, [Sem dopište cenu.]' }))
    expect(rozepsane.ok).toBe(false)
    expect(sendPlainEmail).not.toHaveBeenCalled()
  })

  it('ověřuje vstup: předmět na jeden řádek, neznámá šablona, špatné id', async () => {
    const id = await lead()
    expect((await sendLeadEmail(valid(id, { subject: 'Ahoj\nBcc: x@y.cz' }))).ok).toBe(false)
    expect((await sendLeadEmail(valid(id, { template: 'neznama' }))).ok).toBe(false)
    expect((await sendLeadEmail(valid('neni-uuid'))).ok).toBe(false)
    expect((await sendLeadEmail(valid(id, { body: '   ' }))).ok).toBe(false)
    expect(sendPlainEmail).not.toHaveBeenCalled()
  })

  it('schůzka se předá do `sendLeadMeetingEmail` s pražským časem převedeným na okamžik', async () => {
    const id = await lead()
    vi.mocked(sendLeadMeetingEmail).mockResolvedValue({ ok: true, meetUrl: 'https://meet.google.com/a-b-c', when: 'čtvrtek 26. listopadu v 15:00' })

    const result = await sendLeadEmail(
      valid(id, { template: 'schuzka', date: '2026-11-26', time: '15:00', minutes: 30 }),
    )
    expect(result).toEqual({ ok: true, message: 'E-mail se schůzkou odeslán (čtvrtek 26. listopadu v 15:00).' })
    expect(vi.mocked(sendLeadMeetingEmail).mock.calls[0]![0]).toMatchObject({
      leadId: id,
      // 15:00 v Praze v listopadu je 14:00 UTC.
      startsAt: '2026-11-26T14:00:00.000Z',
      minutes: 30,
      intro: 'Dobrý den,\n\nposílám nabídku.',
    })
    expect(sendPlainEmail).not.toHaveBeenCalled()
  })

  it('chybu schůzky vrátí tak, jak je', async () => {
    const id = await lead()
    vi.mocked(sendLeadMeetingEmail).mockResolvedValue({ ok: false, error: 'V tu dobu už máte v kalendáři něco jiného. Vyberte jiný čas.' })
    const result = await sendLeadEmail(valid(id, { template: 'schuzka', date: '2026-11-26', time: '15:00', minutes: 30 }))
    expect(result).toEqual({ ok: false, error: 'V tu dobu už máte v kalendáři něco jiného. Vyberte jiný čas.' })
  })

  it('schůzka bez data, času a délky neprojde', async () => {
    const id = await lead()
    expect((await sendLeadEmail(valid(id, { template: 'schuzka' }))).ok).toBe(false)
    expect(sendLeadMeetingEmail).not.toHaveBeenCalled()
  })
})
