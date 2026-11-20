import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * „Poslat e-mail" z Hovorů (R-121): tři šablony a schůzka s Google Meet
 * proti skutečnému Postgresu se SQL z migrací 008, 044, 105 a 115.
 *
 * Co se hlídá:
 *  - šablony nemají vymyšlené údaje, nedopsaná místa ani pomlčky ve větách,
 *  - schůzka je **všechno nebo nic**: selže-li Google nebo e-mail, kontakt
 *    i kalendář zůstanou, jak byly, a událost v Googlu se smaže,
 *  - kolize v kalendáři zastaví schůzku dřív, než se vytvoří Meet.
 */

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { sendLeadMeetingEmail } from '@/lib/admin/lead-meeting'
import {
  LEAD_MAIL_TEMPLATES,
  buildOfferBody,
  formatPrice,
  leadMailDefaults,
  meetingTail,
} from '@/lib/admin/lead-mail-templates'
import { isoToPragueDateAndTime } from '@/lib/prague-time'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')

describe('šablony e-mailu', () => {
  const ctx = { todayISO: '2026-11-20', nextCallDate: '2026-11-25' }

  it('jsou tři a v pořadí portfolio, nabídka, schůzka', () => {
    expect(LEAD_MAIL_TEMPLATES.map((t) => t.id)).toEqual(['portfolio', 'nabidka', 'schuzka'])
  })

  it('žádná nemá nedopsané místo v hranatých závorkách ani pomlčku jako spojku', () => {
    for (const { id } of LEAD_MAIL_TEMPLATES) {
      const { subject, body } = leadMailDefaults(id, { ...ctx, startsAt: '2026-11-26T13:00:00.000Z', price: '12 000 Kč' })
      expect(`${subject}\n${body}`, id).not.toMatch(/\[[^\]]*\]/)
      expect(`${subject}\n${body}`, id).not.toMatch(/[—–]/)
      expect(body, id).not.toMatch(/undefined|null/)
      expect(body.startsWith('Dobrý den,'), id).toBe(true)
    }
  })

  it('nabídka nese cenu, kterou Kryštof zadal, a nic z ceníku na webu', () => {
    const body = buildOfferBody('10 000 až 15 000 Kč')
    expect(body).toContain('Cena za váš projekt: 10 000 až 15 000 Kč')
    // Ceník na vizeon.cz je jen rozmezí; cena se u každé zakázky říká zvlášť.
    for (const web of ['4 999', '9 999', '14 999', '29 990', '480 Kč', 'Micro Page', 'Promo Page', 'Pro Web']) {
      expect(body).not.toContain(web)
    }
    expect(body).toContain('https://vizeon.cz')
    // Za odkazem nesmí být tečka ani čárka, jinak se dostane do adresy v HTML e-mailu.
    expect(body).not.toMatch(/https?:\/\/\S*[.,;)]($|\s)/)
    expect(body).toContain('Kryštof Sobotka')
  })

  it('nabídka bez ceny nemá řádek s cenou (okno ji odeslat nedovolí)', () => {
    for (const empty of [undefined, null, '', '   ']) {
      expect(buildOfferBody(empty)).not.toContain('Cena za váš projekt')
    }
  })

  it('cena z odhadované hodnoty kontaktu je text s obyčejnou mezerou', () => {
    expect(formatPrice(12000)).toBe('12 000 Kč')
    expect(formatPrice('15000.00')).toBe('15 000 Kč')
    expect(formatPrice(null)).toBe('')
    expect(formatPrice(0)).toBe('')
    expect(formatPrice('abc')).toBe('')
    expect(formatPrice(12000)).not.toMatch(/\u00a0|\u202f/)
  })

  it('portfolio je dosavadní text s odkazem na portfolio a termínem příštího hovoru', () => {
    const { subject, body } = leadMailDefaults('portfolio', ctx)
    expect(subject).toBe('Tvorba webových stránek - Kryštof Sobotka')
    expect(body).toContain('https://www.vizeon.cz/')
    expect(body).toContain('dalším telefonickém hovoru')
  })

  it('schůzka má předmět s termínem; text pod úvodem doplňuje kód', () => {
    const startsAt = '2026-11-26T13:00:00.000Z'
    expect(leadMailDefaults('schuzka', { ...ctx, startsAt }).subject).toBe('Naše schůzka čtvrtek 26. listopadu v 14:00')

    const tail = meetingTail(startsAt, 30)
    expect(tail).toContain('Kdy: čtvrtek 26. listopadu v 14:00 (30 minut)')
    expect(tail).toContain('odkaz na Google Meet se vytvoří při odeslání')
    expect(tail).not.toContain('meet.google.com')
    expect(tail).toContain('https://vizeon.cz')
    expect(tail).toContain('krystof@vizeon.cz')
  })
})

describe('schůzka s Google Meet z Hovorů', () => {
  let db: PGlite

  const SCHEMA = `
    CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, phone text, email text);
    CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text, client_phone text,
      description text, status text NOT NULL DEFAULT 'new', lead_origin text NOT NULL DEFAULT 'vizeon',
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text,
      starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, event_type text NOT NULL DEFAULT 'manual',
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL, lead_origin text NOT NULL DEFAULT 'vizeon',
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, contact_name text, phone text, email text,
      lead_status text DEFAULT 'cold', next_action text, next_action_date date, next_action_time time, next_action_type text,
      notes text, estimated_value numeric, call_answered boolean,
      reminder_day_before_sent boolean DEFAULT false, reminder_2h_before_sent boolean DEFAULT false,
      portfolio_sent_at timestamptz, contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
      calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(), updated_at timestamptz
    );
    ALTER TABLE calendar_events ADD COLUMN lead_id uuid REFERENCES client_leads(id) ON DELETE SET NULL;
    CREATE TABLE lead_notes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES client_leads(id) ON DELETE CASCADE,
      content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE consultation_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scheduled_at timestamptz NOT NULL UNIQUE, channel text NOT NULL DEFAULT 'phone', channel_other_text text,
      client_wish text NOT NULL DEFAULT '', meeting_link text, client_email text,
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now()
    );
  `

  const DAY = 86_400_000
  /** Za tři dny ve 13:00 UTC, tedy v 14:00 nebo 15:00 v Praze podle času. */
  const START = (() => {
    const d = new Date(Date.now() + 3 * DAY)
    d.setUTCHours(13, 0, 0, 0)
    return d.toISOString()
  })()
  const MEET = 'https://meet.google.com/abc-defg-hij'

  const createMeet = vi.fn(async (_event: { title: string; startsAt: string }) => ({ googleEventId: 'g-new', meetUrl: MEET }))
  const deleteMeet = vi.fn(async () => {})
  const send = vi.fn(async (_mail: { to: string; subject: string; text: string; html: string }) => ({
    ok: true as const,
    id: 'r-1',
  }))
  const deps = { createMeet, deleteMeet, send }

  async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    return (await db.query<T>(sql, params)).rows[0]
  }

  /** Kontakt s plánovaným hovorem; `withEvent` ho propojí s událostí v kalendáři. */
  async function lead(opts: { email?: string | null; withEvent?: boolean; date?: string | null } = {}) {
    const date = opts.date === undefined ? '2026-12-01' : opts.date
    let eventId: string | null = null
    if (opts.withEvent) {
      eventId = (
        await one<{ id: string }>(`
          INSERT INTO calendar_events (title, starts_at, ends_at)
          VALUES ('Hovor', '2026-12-01T08:00:00Z', '2026-12-01T09:00:00Z') RETURNING id::text AS id`)
      ).id
    }
    const row = await one<{ id: string }>(
      `INSERT INTO client_leads (company_name, contact_name, phone, email, next_action, next_action_type,
                                 next_action_date, next_action_time, calendar_event_id)
       VALUES ('Truhlářství Ukázkové', 'Jan Ukázkový', '+420777123456', $1, 'Zavolat', 'call', $2::date,
               CASE WHEN $2::date IS NULL THEN NULL ELSE '09:00'::time END, $3)
       RETURNING id::text AS id`,
      [opts.email === undefined ? 'jan@example.cz' : opts.email, date, eventId],
    )
    if (eventId) await db.query(`UPDATE calendar_events SET lead_id = $1 WHERE id = $2`, [row.id, eventId])
    return { leadId: row.id, eventId }
  }

  const input = (leadId: string, over: Record<string, unknown> = {}) => ({
    leadId,
    startsAt: START,
    minutes: 45,
    subject: 'Naše schůzka',
    intro: 'Dobrý den,\n\nposílám odkaz na naši schůzku.',
    ...over,
  })

  const leadState = (leadId: string) =>
    one<{ next_action: string | null; next_action_type: string | null; next_action_date: string | null; next_action_time: string | null; sent: boolean }>(
      `SELECT next_action, next_action_type, next_action_date::text, next_action_time::text, portfolio_sent_at IS NOT NULL AS sent
         FROM client_leads WHERE id = $1`,
      [leadId],
    )

  const eventTimes = (eventId: string) =>
    one<{ starts: string; ends: string; meet_url: string | null; google_event_id: string | null }>(
      `SELECT starts_at AS starts, ends_at AS ends, meet_url, google_event_id FROM calendar_events WHERE id = $1`,
      [eventId],
    )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    await db.exec(read('008_calendar_overlap_guard.sql'))
    await db.exec(read('044_cross_table_overlap_guard.sql'))
    await db.exec(read('105_propojeni_kalendar_hovory.sql'))
    await db.exec(read('115_schuzky_google_meet.sql'))
    // Dávka je na Neonu jedna transakce — kolize u druhého příkazu musí vrátit i první.
    setAdminDbForTests(pgliteAdminDriver(db, { transactional: true }))
  }, 60_000)

  afterAll(() => setAdminDbForTests(null))

  beforeEach(async () => {
    await db.exec('DELETE FROM lead_notes; DELETE FROM client_leads; DELETE FROM calendar_events; DELETE FROM projects; DELETE FROM contacts;')
    vi.clearAllMocks()
    send.mockImplementation(async () => ({ ok: true as const, id: 'r-1' }))
    createMeet.mockImplementation(async () => ({ googleEventId: 'g-new', meetUrl: MEET }))
  })

  it('vytvoří Meet, přepíše příští akci, pošle e-mail s odkazem a zapíše poznámku', async () => {
    const { leadId } = await lead()

    const result = await sendLeadMeetingEmail(input(leadId), deps)
    expect(result).toMatchObject({ ok: true, meetUrl: MEET })

    expect(createMeet).toHaveBeenCalledTimes(1)
    expect(createMeet.mock.calls[0]![0]).toMatchObject({ title: 'Schůzka: Truhlářství Ukázkové', startsAt: START })

    expect(send).toHaveBeenCalledTimes(1)
    const mail = send.mock.calls[0]![0]
    expect(mail.to).toBe('jan@example.cz')
    expect(mail.subject).toBe('Naše schůzka')
    expect(mail.text).toContain(`Připojit se: ${MEET}`)
    expect(mail.text).toContain('https://vizeon.cz')
    expect(mail.html).toContain(MEET)

    const prague = isoToPragueDateAndTime(START)
    const state = await leadState(leadId)
    expect(state).toMatchObject({
      next_action: 'Schůzka přes Google Meet',
      next_action_type: 'meeting',
      next_action_date: prague.date,
      next_action_time: prague.time,
      sent: true,
    })
    const note = await one<{ content: string }>(`SELECT content FROM lead_notes WHERE lead_id = $1`, [leadId])
    expect(note.content).toContain(MEET)
    expect(deleteMeet).not.toHaveBeenCalled()
  })

  it('kontaktu s propojenou událostí posune událost, uloží Meet a nechá délku podle schůzky', async () => {
    const { leadId, eventId } = await lead({ withEvent: true })

    expect((await sendLeadMeetingEmail(input(leadId), deps)).ok).toBe(true)

    const event = await eventTimes(eventId!)
    expect(new Date(event.starts).toISOString()).toBe(START)
    expect(new Date(event.ends).getTime() - new Date(event.starts).getTime()).toBe(45 * 60_000)
    expect(event).toMatchObject({ meet_url: MEET, google_event_id: 'g-new' })
  })

  it('když e-mail neodejde, smaže Meet a vrátí kontakt i událost, jak byly', async () => {
    const { leadId, eventId } = await lead({ withEvent: true })
    send.mockImplementation(async () => ({ ok: false as const, error: 'Resend 500: bez odpovědi' }) as never)

    const result = await sendLeadMeetingEmail(input(leadId), deps)
    expect(result.ok).toBe(false)
    expect(deleteMeet).toHaveBeenCalledWith('g-new')

    expect(await leadState(leadId)).toMatchObject({
      next_action: 'Zavolat',
      next_action_type: 'call',
      next_action_date: '2026-12-01',
      next_action_time: '09:00:00',
      sent: false,
    })
    const event = await eventTimes(eventId!)
    expect(new Date(event.starts).toISOString()).toBe('2026-12-01T08:00:00.000Z')
    expect(new Date(event.ends).toISOString()).toBe('2026-12-01T09:00:00.000Z')
    expect(event.meet_url).toBeNull()
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM lead_notes`)).n).toBe(0)
  })

  it('když Google odmítne, e-mail se neposílá a kontakt zůstane beze změny', async () => {
    const { leadId } = await lead({ date: null })
    createMeet.mockImplementation(async () => {
      throw new Error('Google Kalendář 403: bez práv')
    })

    const result = await sendLeadMeetingEmail(input(leadId), deps)
    expect(result).toEqual({ ok: false, error: 'Google Kalendář 403: bez práv' })
    expect(send).not.toHaveBeenCalled()
    // Kontakt, který termín neměl, ho po návratu pořád nemá.
    expect(await leadState(leadId)).toMatchObject({
      next_action: 'Zavolat',
      next_action_date: null,
      next_action_time: null,
    })
  })

  it('kolize v kalendáři zastaví schůzku dřív, než vznikne Meet', async () => {
    const { leadId, eventId } = await lead({ withEvent: true })
    const end = new Date(Date.parse(START) + 60 * 60_000).toISOString()
    await db.query(`INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ('Jiná schůzka', $1, $2)`, [START, end])

    const result = await sendLeadMeetingEmail(input(leadId), deps)
    expect(result).toEqual({ ok: false, error: 'V tu dobu už máte v kalendáři něco jiného. Vyberte jiný čas.' })
    expect(createMeet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect((await leadState(leadId)).next_action).toBe('Zavolat')
    expect(new Date((await eventTimes(eventId!)).starts).toISOString()).toBe('2026-12-01T08:00:00.000Z')
  })

  it('nic nezačne bez e-mailu kontaktu, s časem v minulosti ani s absurdní délkou', async () => {
    const { leadId } = await lead({ email: null })
    expect(await sendLeadMeetingEmail(input(leadId), deps)).toEqual({ ok: false, error: 'Kontakt nemá vyplněný e-mail.' })

    const ok = await lead()
    const past = new Date(Date.now() - DAY).toISOString()
    expect(await sendLeadMeetingEmail(input(ok.leadId, { startsAt: past }), deps)).toEqual({
      ok: false,
      error: 'Schůzka nemůže být v minulosti.',
    })
    expect((await sendLeadMeetingEmail(input(ok.leadId, { minutes: 600 }), deps)).ok).toBe(false)
    expect(await sendLeadMeetingEmail(input('00000000-0000-0000-0000-000000000000'), deps)).toEqual({
      ok: false,
      error: 'Kontakt nenalezen.',
    })
    expect(createMeet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('databáze bez migrace 105 schůzku nezablokuje, jen se nepřesune událost v kalendáři', async () => {
    const { leadId, eventId } = await lead({ withEvent: true })
    await db.exec('DROP FUNCTION admin_lead_reschedule(uuid, timestamptz, timestamptz)')
    try {
      expect((await sendLeadMeetingEmail(input(leadId), deps)).ok).toBe(true)
      expect((await leadState(leadId)).next_action).toBe('Schůzka přes Google Meet')
      expect(new Date((await eventTimes(eventId!)).starts).toISOString()).toBe('2026-12-01T08:00:00.000Z')
    } finally {
      await db.exec(read('105_propojeni_kalendar_hovory.sql'))
    }
  })
})
