import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Serverová akce „Poslat e-mail" (R-132): vstup se ověřuje na serveru,
 * adresát je vždy e-mail uloženého kontaktu (z Hovorů, z `contacts` nebo
 * firma od AI asistenta) a záznam o odeslání se zapíše jen tehdy, když
 * e-mail opravdu odešel.
 */

vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendPlainEmail: vi.fn(async () => true) }))
vi.mock('@/lib/admin/lead-meeting', () => ({ sendLeadMeetingEmail: vi.fn() }))
vi.mock('@/lib/admin/contacts', () => ({ ensureContact: vi.fn(async () => null) }))

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
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, company text, email text, phone text
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, contact_name text, phone text, email text,
      lead_status text DEFAULT 'cold', next_action text, next_action_type text, notes text,
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL, portfolio_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE lead_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES client_leads(id) ON DELETE CASCADE,
      content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE outreach_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, contact_name text, phone text, email text,
      website text, call_summary text, callback_at timestamptz, callback_text text, demo_url text,
      client_lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL,
      handled_at timestamptz, handled_reason text, updated_at timestamptz
    );
  `)
  setAdminDbForTests(pgliteAdminDriver(db))
}, 60_000)

afterAll(() => setAdminDbForTests(null))

beforeEach(async () => {
  await db.exec('DELETE FROM outreach_leads; DELETE FROM lead_notes; DELETE FROM client_leads; DELETE FROM contacts;')
  vi.clearAllMocks()
  vi.mocked(sendPlainEmail).mockResolvedValue(true)
  vi.mocked(sendLeadMeetingEmail).mockResolvedValue({ ok: true, meetUrl: 'https://meet.google.com/a-b-c', when: 'čtvrtek 26. listopadu v 15:00' })
})

type Kind = 'lead' | 'contact' | 'outreach'
const ref = (kind: Kind, id: string) => ({ kind, id })

async function id(sql: string, params: unknown[] = []): Promise<string> {
  return (await db.query<{ id: string }>(sql, params)).rows[0].id
}

const lead = (email: string | null = 'jan@example.cz', status = 'cold') =>
  id(`INSERT INTO client_leads (company_name, email, lead_status) VALUES ('Firma Ukázková', $1, $2) RETURNING id::text AS id`, [email, status])

const contact = (email: string | null = 'jana@example.cz') =>
  id(
    `INSERT INTO contacts (display_name, company, email, phone) VALUES ('Jana Ukázková', 'Kavárna Ukázková', $1, '+420777123456') RETURNING id::text AS id`,
    [email],
  )

const outreach = (email: string | null = 'dilna@example.cz') =>
  id(`INSERT INTO outreach_leads (company_name, contact_name, email) VALUES ('Dílna Ukázková', 'Petr Ukázkový', $1) RETURNING id::text AS id`, [email])

const valid = (target: { kind: Kind; id: string }, over: Record<string, unknown> = {}) => ({
  template: 'nabidka',
  target,
  subject: 'Nabídka na tvorbu webu - Kryštof Sobotka',
  body: 'Dobrý den,\n\nposílám nabídku.',
  ...over,
})

const meeting = (target: { kind: Kind; id: string }) =>
  valid(target, { template: 'schuzka', date: '2026-11-26', time: '15:00', minutes: 30 })

const count = async (table: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n

describe('sendLeadEmail', () => {
  it('pošle e-mail na adresu uloženého kontaktu a zapíše to do historie', async () => {
    const leadId = await lead()
    const result = await sendLeadEmail(valid(ref('lead', leadId)))

    expect(result).toEqual({ ok: true, message: 'E-mail odeslán.' })
    expect(requireAuth).toHaveBeenCalled()
    expect(sendPlainEmail).toHaveBeenCalledWith({
      to: 'jan@example.cz',
      subject: 'Nabídka na tvorbu webu - Kryštof Sobotka',
      text: 'Dobrý den,\n\nposílám nabídku.',
    })
    const row = await db.query<{ sent: boolean }>(`SELECT portfolio_sent_at IS NOT NULL AS sent FROM client_leads WHERE id = $1`, [leadId])
    expect(row.rows[0].sent).toBe(true)
    const note = await db.query<{ content: string }>(`SELECT content FROM lead_notes WHERE lead_id = $1`, [leadId])
    expect(note.rows[0].content).toContain('Nabídka na tvorbu webu')
  })

  it('adresát z prohlížeče se nebere: pole `to` se ignoruje', async () => {
    const leadId = await lead()
    await sendLeadEmail({ ...valid(ref('lead', leadId)), to: 'cizi@example.com' })
    expect(vi.mocked(sendPlainEmail).mock.calls[0]![0].to).toBe('jan@example.cz')
  })

  it('když e-mail neodejde, nic se do historie nezapíše', async () => {
    const leadId = await lead()
    vi.mocked(sendPlainEmail).mockResolvedValue(false)

    const result = await sendLeadEmail(valid(ref('lead', leadId)))
    expect(result.ok).toBe(false)
    expect(await count('lead_notes')).toBe(0)
    expect((await db.query<{ sent: boolean }>(`SELECT portfolio_sent_at IS NOT NULL AS sent FROM client_leads`)).rows[0].sent).toBe(false)
  })

  it('odmítne kontakt bez e-mailu, neexistující kontakt a nedopsané místo v závorkách', async () => {
    const bez = await lead(null)
    expect(await sendLeadEmail(valid(ref('lead', bez)))).toEqual({ ok: false, error: 'Kontakt nemá vyplněný e-mail.' })
    for (const kind of ['lead', 'contact', 'outreach'] as const) {
      expect(await sendLeadEmail(valid(ref(kind, '00000000-0000-0000-0000-000000000000')))).toEqual({
        ok: false,
        error: 'Kontakt nenalezen.',
      })
    }

    const leadId = await lead()
    const rozepsane = await sendLeadEmail(valid(ref('lead', leadId), { body: 'Dobrý den, [Sem dopište cenu.]' }))
    expect(rozepsane.ok).toBe(false)
    expect(sendPlainEmail).not.toHaveBeenCalled()
  })

  it('ověřuje vstup: předmět na jeden řádek, neznámá šablona a druh, špatné id', async () => {
    const leadId = await lead()
    const target = ref('lead', leadId)
    expect((await sendLeadEmail(valid(target, { subject: 'Ahoj\nBcc: x@y.cz' }))).ok).toBe(false)
    expect((await sendLeadEmail(valid(target, { template: 'neznama' }))).ok).toBe(false)
    expect((await sendLeadEmail(valid({ kind: 'invoice' as Kind, id: leadId }))).ok).toBe(false)
    expect((await sendLeadEmail(valid(ref('lead', 'neni-uuid')))).ok).toBe(false)
    expect((await sendLeadEmail(valid(target, { body: '   ' }))).ok).toBe(false)
    expect(sendPlainEmail).not.toHaveBeenCalled()
  })

  describe('kontakt z Kontaktů', () => {
    it('pošle na e-mail kontaktu a historii zapíše k jeho otevřenému řádku v Hovorech', async () => {
      const contactId = await contact()
      const leadId = await lead('jine@example.cz')
      await db.query(`UPDATE client_leads SET contact_id = $1 WHERE id = $2`, [contactId, leadId])

      expect((await sendLeadEmail(valid(ref('contact', contactId)))).ok).toBe(true)
      expect(vi.mocked(sendPlainEmail).mock.calls[0]![0].to).toBe('jana@example.cz')
      expect(await count('lead_notes')).toBe(1)
    })

    it('bez řádku v Hovorech e-mail odejde, ale nic se kvůli němu nezakládá', async () => {
      const contactId = await contact()
      expect((await sendLeadEmail(valid(ref('contact', contactId)))).ok).toBe(true)
      expect(await count('client_leads')).toBe(0)
      expect(await count('lead_notes')).toBe(0)
    })

    it('schůzka kontaktu bez řádku v Hovorech ho tam založí a předá ho `sendLeadMeetingEmail`', async () => {
      const contactId = await contact()
      const result = await sendLeadEmail(meeting(ref('contact', contactId)))
      expect(result.ok).toBe(true)

      const row = (await db.query<{ id: string; company_name: string; contact_name: string; email: string; contact_id: string }>(
        `SELECT id::text AS id, company_name, contact_name, email, contact_id::text AS contact_id FROM client_leads`,
      )).rows
      expect(row).toHaveLength(1)
      expect(row[0]).toMatchObject({ company_name: 'Kavárna Ukázková', contact_name: 'Jana Ukázková', email: 'jana@example.cz', contact_id: contactId })
      expect(vi.mocked(sendLeadMeetingEmail).mock.calls[0]![0]).toMatchObject({
        leadId: row[0].id,
        to: 'jana@example.cz',
        startsAt: '2026-11-26T14:00:00.000Z',
        minutes: 30,
      })
      expect(sendPlainEmail).not.toHaveBeenCalled()
    })

    it('když schůzka nevyjde, kontakt založený kvůli ní se zase zahodí', async () => {
      const contactId = await contact()
      vi.mocked(sendLeadMeetingEmail).mockResolvedValue({ ok: false, error: 'Google Kalendář 403: bez práv' })

      const result = await sendLeadEmail(meeting(ref('contact', contactId)))
      expect(result).toEqual({ ok: false, error: 'Google Kalendář 403: bez práv' })
      expect(await count('client_leads')).toBe(0)
    })

    it('hotový kontakt v Hovorech schůzka nepřepíše: založí se nový', async () => {
      const contactId = await contact()
      const done = await lead('hotovo@example.cz', 'converted')
      await db.query(`UPDATE client_leads SET contact_id = $1 WHERE id = $2`, [contactId, done])

      expect((await sendLeadEmail(meeting(ref('contact', contactId)))).ok).toBe(true)
      expect(await count('client_leads')).toBe(2)
      expect(vi.mocked(sendLeadMeetingEmail).mock.calls[0]![0].leadId).not.toBe(done)
    })

    it('existující řádek v Hovorech se nezakládá znovu a po neúspěchu se nemaže', async () => {
      const contactId = await contact()
      const leadId = await lead()
      await db.query(`UPDATE client_leads SET contact_id = $1 WHERE id = $2`, [contactId, leadId])
      vi.mocked(sendLeadMeetingEmail).mockResolvedValue({ ok: false, error: 'V tu dobu už máte v kalendáři něco jiného. Vyberte jiný čas.' })

      expect((await sendLeadEmail(meeting(ref('contact', contactId)))).ok).toBe(false)
      expect(await count('client_leads')).toBe(1)
      expect(vi.mocked(sendLeadMeetingEmail).mock.calls[0]![0].leadId).toBe(leadId)
    })
  })

  describe('firma od AI asistenta', () => {
    it('obyčejný e-mail firmu nepřevezme', async () => {
      const outreachId = await outreach()
      expect((await sendLeadEmail(valid(ref('outreach', outreachId)))).ok).toBe(true)
      expect(vi.mocked(sendPlainEmail).mock.calls[0]![0].to).toBe('dilna@example.cz')
      const row = (await db.query<{ handled_at: string | null }>(`SELECT handled_at FROM outreach_leads`)).rows[0]
      expect(row.handled_at).toBeNull()
      expect(await count('client_leads')).toBe(0)
    })

    it('schůzka firmu založí v Hovorech a převezme ji z fronty', async () => {
      const outreachId = await outreach()
      expect((await sendLeadEmail(meeting(ref('outreach', outreachId)))).ok).toBe(true)

      const lead = (await db.query<{ id: string; company_name: string; notes: string }>(`SELECT id::text AS id, company_name, notes FROM client_leads`)).rows[0]
      expect(lead.company_name).toBe('Dílna Ukázková')
      expect(lead.notes).toContain('Z Growth OS')
      const row = (await db.query<{ handled_reason: string; client_lead_id: string }>(
        `SELECT handled_reason, client_lead_id::text AS client_lead_id FROM outreach_leads`,
      )).rows[0]
      expect(row).toEqual({ handled_reason: 'prevzato', client_lead_id: lead.id })
    })

    it('když schůzka nevyjde, firma zůstane ve frontě a nic se v Hovorech nezaloží', async () => {
      const outreachId = await outreach()
      vi.mocked(sendLeadMeetingEmail).mockResolvedValue({ ok: false, error: 'E-mail se nepodařilo odeslat, schůzka se nezapsala. Zkuste to prosím znovu.' })

      expect((await sendLeadEmail(meeting(ref('outreach', outreachId)))).ok).toBe(false)
      expect(await count('client_leads')).toBe(0)
      expect((await db.query<{ handled_at: string | null }>(`SELECT handled_at FROM outreach_leads`)).rows[0].handled_at).toBeNull()
    })
  })

  it('schůzka se předá do `sendLeadMeetingEmail` s pražským časem převedeným na okamžik', async () => {
    const leadId = await lead()
    const result = await sendLeadEmail(meeting(ref('lead', leadId)))
    expect(result).toEqual({ ok: true, message: 'E-mail se schůzkou odeslán (čtvrtek 26. listopadu v 15:00).' })
    expect(vi.mocked(sendLeadMeetingEmail).mock.calls[0]![0]).toMatchObject({
      leadId,
      // 15:00 v Praze v listopadu je 14:00 UTC.
      startsAt: '2026-11-26T14:00:00.000Z',
      minutes: 30,
      intro: 'Dobrý den,\n\nposílám nabídku.',
    })
    expect(sendPlainEmail).not.toHaveBeenCalled()
  })

  it('schůzka bez data, času a délky neprojde', async () => {
    const leadId = await lead()
    expect((await sendLeadEmail(valid(ref('lead', leadId), { template: 'schuzka' }))).ok).toBe(false)
    expect(sendLeadMeetingEmail).not.toHaveBeenCalled()
  })
})
