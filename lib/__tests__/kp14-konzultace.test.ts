import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { preparePortalMoneyTables } from '@/lib/__tests__/helpers/portal-money-tables'
import { prepareConsultationTables } from '@/lib/__tests__/helpers/consultation-tables'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from '@/lib/__tests__/helpers/admin-pglite'

vi.mock('@/lib/db', () => ({ sql: vi.fn() }))

import { finishConsultationBooking, finishConsultationCancel, finishConsultationMove } from '@/lib/admin/consultations'
import { renderConsultationEmail } from '@/lib/admin/consultation-email'
import { canClientChange, groupSlotsByDay } from '@/lib/consultations/rules'
import { addIsoDays, getPragueTodayISO, pragueWallClockToISO } from '@/lib/prague-time'

// KP14 (R-121, R-126, D-K13): konzultace z volna. Migrace 123 dvakrát po sobě
// nad PGlite, klient čte a rezervuje jako role portal_app, admin a odkaz /p
// jako vlastník tabulek. Hlídá se: mimo volno nic, obsazený čas ne, cizí
// rezervace jen jako obsazený čas, lhůta 24 h, limity a dokončení (Meet, e-mail).

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000001'
const MA = 'aaaaaaaa-0000-4000-8000-000000000a01'
const MB = 'bbbbbbbb-0000-4000-8000-000000000b01'
const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const PB = 'bbbbbbbb-0000-4000-8000-0000000000b1'

let db: PGlite

async function asClient<T = Record<string, unknown>>(clientId: string | null, sqlText: string, params: unknown[] = []) {
  await db.exec('BEGIN')
  try {
    await db.exec('SET LOCAL ROLE portal_app')
    await db.query("SELECT set_config('app.client_id', $1, true)", [clientId ?? ''])
    const res = await db.query<T>(sqlText, params)
    await db.exec('COMMIT')
    return res.rows
  } catch (err) {
    await db.exec('ROLLBACK')
    throw err
  }
}

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? 'bez kódu')

// Volno za tři dny 14:00–16:00 po 30 minutách (pražský čas).
const DAY = addIsoDays(getPragueTodayISO(), 3)
const [Y, M, D] = DAY.split('-').map(Number)
const at = (h: number, m = 0) => pragueWallClockToISO(Y, M, D, h, m)

const freeAs = async (clientId: string) =>
  (await asClient<{ starts_at: Date }>(clientId, `SELECT starts_at FROM portal.free_consultation_slots(now(), now() + interval '10 days')`))
    .map((r) => new Date(r.starts_at).toISOString())

const book = (clientId: string, member: string, project: string, startsAt: string, topic = 'Projít návrh webu') =>
  asClient<{ id: string }>(clientId, 'SELECT portal.book_consultation($1, $2, $3, $4) AS id', [project, member, startsAt, topic])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, client_email text,
      description text, status text NOT NULL DEFAULT 'new', progress integer NOT NULL DEFAULT 0,
      deadline date, project_url text, price numeric, notes text, public_token uuid DEFAULT gen_random_uuid(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.exec('CREATE TABLE client_feedback (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, nps integer NOT NULL, content text, created_at timestamptz DEFAULT now())')
  await db.exec(read('migrations', '092_client_requests.sql'))
  await db.exec(read('migrations', '093_project_activity.sql'))
  await db.exec(read('migrations', '095_portal_schema.sql'))
  await preparePortalMoneyTables(db)
  await prepareConsultationTables(db)
  for (let i = 0; i < 2; i++) {
    await db.exec(read('migrations', '095_portal_schema.sql'))
    await db.exec(read('migrations', '096_portal_requests_messages.sql'))
    await db.exec(read('migrations', '113_portal_supabase_auth.sql'))
    await db.exec(read('migrations', '121_sluzby_a_etapy.sql'))
    await db.exec(read('migrations', '122_portal_penize_faktury.sql'))
    await db.exec(read('migrations', '123_konzultace_z_volna.sql'))
  }
  await db.exec('CREATE ROLE portal_app NOLOGIN')
  for (const stmt of read('scripts', 'portal-grants.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.exec(stmt)
  }

  await db.query(
    `INSERT INTO projects (id, client_name, client_email, client_phone) VALUES
      ($1, 'Firma A', 'zakazka-a@example.cz', '+420777000111'),
      ($2, 'Firma B', 'zakazka-b@example.cz', NULL)`,
    [PA, PB],
  )
  await db.query("INSERT INTO portal.clients (id, name) VALUES ($1, 'Klient A'), ($2, 'Klient B')", [A, B])
  await db.query('SELECT portal.link_project($1, $2)', [A, PA])
  await db.query('SELECT portal.link_project($1, $2)', [B, PB])
  await db.query(
    `INSERT INTO portal.members (id, client_id, clerk_user_id, email, role) VALUES
      ($1, $2, 'sb-a', 'jana@example.cz', 'owner'), ($3, $4, 'sb-b', 'petr@example.cz', 'owner')`,
    [MA, A, MB, B],
  )
  setAdminDbForTests(pgliteAdminDriver(db))
}, 60_000)

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  await db.exec(`
    DELETE FROM client_leads; DELETE FROM calendar_events; DELETE FROM consultation_slots;
    DELETE FROM client_availability;
  `)
  await db.query(
    `INSERT INTO client_availability (day, start_time, end_time, slot_minutes) VALUES ($1::date, '14:00', '16:00', 30)`,
    [DAY],
  )
})

describe('volné časy', () => {
  it('nabízí jen časy ve volnu, po délce konzultace', async () => {
    expect(await freeAs(A)).toEqual([at(14), at(14, 30), at(15), at(15, 30)])
  })

  it('událost v kalendáři, konzultace i plánovaný hovor čas zaberou', async () => {
    await db.query(`INSERT INTO calendar_events (title, starts_at, ends_at) VALUES ('Schůzka', $1, $2)`, [at(14), at(14, 20)])
    await db.query(
      `INSERT INTO client_leads (company_name, lead_status, next_action_date, next_action_time) VALUES ('Hovor', 'warm', $1::date, '15:00')`,
      [DAY],
    )
    expect(await freeAs(A)).toEqual([at(14, 30), at(15, 30)])
  })

  it('volno, které začíná za méně než dvě hodiny, se nenabízí', async () => {
    await db.exec('DELETE FROM client_availability')
    await db.query(
      `INSERT INTO client_availability (day, start_time, end_time, slot_minutes) VALUES ($1::date, '00:00', '23:45', 15)`,
      [getPragueTodayISO()],
    )
    const slots = await freeAs(A)
    const limit = Date.now() + 2 * 3_600_000 - 60_000
    expect(slots.every((s) => new Date(s).getTime() >= limit)).toBe(true)
  })

  it('opakované volno drží pražský čas přes změnu letního času a přeskočí smazaný den', async () => {
    await db.query(
      `INSERT INTO client_availability (day, start_time, end_time, slot_minutes, repeat_weekly, repeat_until, skip_days)
       VALUES ('2026-10-15', '14:00', '15:00', 30, true, '2026-11-05', ARRAY['2026-10-29']::date[])`,
    )
    const rows = await db.query<{ day: Date; starts_at: Date }>(
      `SELECT day, starts_at FROM client_availability_occurrences('2026-10-10', '2026-11-30') WHERE repeat_weekly ORDER BY starts_at`,
    )
    expect(rows.rows.map((r) => new Date(r.starts_at).toISOString())).toEqual([
      '2026-10-15T12:00:00.000Z', // letní čas, 14:00 v Praze
      '2026-10-22T12:00:00.000Z',
      '2026-11-05T13:00:00.000Z', // zimní čas, pořád 14:00 v Praze; 29. 10. smazaný
    ])
  })

  it('klient bez kontextu volné časy nedostane', async () => {
    expect(await code(asClient(null, `SELECT * FROM portal.free_consultation_slots(now(), now() + interval '1 day')`))).toBe('P0002')
  })
})

describe('rezervace z prostoru', () => {
  it('mimo volno odmítne, ve volnu založí rezervaci, událost i kontakt v Hovorech', async () => {
    expect(await code(book(A, MA, PA, at(13)))).toBe('23P01')
    expect(await code(book(A, MA, PA, at(14, 10)))).toBe('23P01') // mimo mřížku volna

    const [{ id }] = await book(A, MA, PA, at(14))
    const slot = await db.query<Record<string, unknown>>('SELECT * FROM consultation_slots WHERE id = $1', [id])
    expect(slot.rows[0]).toMatchObject({
      duration_minutes: 30, booked_via: 'prostor', channel: 'meet', meet_status: 'pending',
      client_email: 'jana@example.cz', portal_member_id: MA,
    })
    const ev = await db.query<{ starts_at: Date; ends_at: Date; lead_id: string }>(
      'SELECT starts_at, ends_at, lead_id FROM calendar_events WHERE consultation_slot_id = $1', [id],
    )
    expect(new Date(ev.rows[0].starts_at).toISOString()).toBe(at(14))
    expect(new Date(ev.rows[0].ends_at).toISOString()).toBe(at(14, 30))
    const lead = await db.query<{ next_action: string; next_action_type: string }>(
      'SELECT next_action, next_action_type FROM client_leads WHERE id = $1', [ev.rows[0].lead_id],
    )
    expect(lead.rows[0]).toEqual({ next_action: 'Konzultace z klientského prostoru', next_action_type: 'meeting' })
  })

  it('tentýž čas dvakrát neprojde — druhý klient dostane kolizi a cizí rezervaci vidí jen jako obsazený čas', async () => {
    // PGlite má jedno spojení, takže tu jde o dvě rezervace po sobě. Souběh
    // dvou spojení drží v Neonu zámek `pg_advisory_xact_lock` v consultation_book
    // a UNIQUE na scheduled_at.
    expect(await code(book(A, MA, PA, at(14, 30)))).toBe('ok')
    expect(await code(book(B, MB, PB, at(14, 30)))).toBe('23P01')
    // I zápis mimo funkci zastaví databáze (překryvový guard dřív než UNIQUE).
    expect(['23P01', '23505']).toContain(await code(db.query(
      `INSERT INTO consultation_slots (project_id, scheduled_at, client_wish) VALUES ($1, $2, 'Obejít funkci')`, [PB, at(14, 30)],
    )))

    expect(await freeAs(B)).not.toContain(at(14, 30))
    expect(await asClient(A, 'SELECT id FROM portal.consultations')).toHaveLength(1)
    expect(await asClient(B, 'SELECT id FROM portal.consultations')).toHaveLength(0)
  })

  it('cizí zakázku ani cizího člena rezervovat nejde', async () => {
    expect(await code(book(A, MA, PB, at(14)))).toBe('P0002')
    expect(await code(book(A, MB, PA, at(14)))).toBe('P0002')
  })

  it('krátký popis odmítne', async () => {
    expect(await code(book(A, MA, PA, at(14), 'ok'))).toBe('P0001')
  })

  it('počet konzultací se neomezuje, jen deset rezervací za hodinu na člena', async () => {
    await db.exec('DELETE FROM client_availability')
    await db.query(
      `INSERT INTO client_availability (day, start_time, end_time, slot_minutes) VALUES ($1::date, '09:00', '12:00', 15)`,
      [DAY],
    )
    for (let i = 0; i < 10; i++) await book(A, MA, PA, at(9 + Math.floor((i * 15) / 60), (i * 15) % 60))
    expect(await code(book(A, MA, PA, at(11, 45)))).toBe('P0429')
  })

  it('klient nesmí volat vlastnické funkce ani číst tabulky adminu', async () => {
    expect(await code(asClient(A, `SELECT consultation_book($1, $2, 'meet', NULL, 'Ahoj světe', NULL, NULL, 'prostor', NULL)`, [PA, at(14)]))).toBe('42501')
    expect(await code(asClient(A, 'SELECT * FROM client_availability'))).toBe('42501')
    expect(await code(asClient(A, 'SELECT * FROM consultation_slots'))).toBe('42501')
  })
})

describe('přesun a zrušení', () => {
  it('přesun posune rezervaci, událost i Hovory a vynuluje potvrzení', async () => {
    const [{ id }] = await book(A, MA, PA, at(15))
    await db.query('UPDATE consultation_slots SET confirmation_sent_at = now(), reminder_day_before_sent = true WHERE id = $1', [id])

    expect(await code(asClient(A, 'SELECT * FROM portal.move_consultation($1, $2, $3)', [id, MA, at(13)]))).toBe('23P01')
    const moved = await asClient<{ google_event_id: string | null; minutes: number }>(
      A, 'SELECT * FROM portal.move_consultation($1, $2, $3)', [id, MA, at(15, 30)],
    )
    expect(moved[0]).toEqual({ google_event_id: null, minutes: 30 })

    const slot = await db.query<Record<string, unknown>>(
      'SELECT scheduled_at, confirmation_sent_at, reminder_day_before_sent, move_count FROM consultation_slots WHERE id = $1', [id],
    )
    expect(new Date(slot.rows[0].scheduled_at as string).toISOString()).toBe(at(15, 30))
    expect(slot.rows[0]).toMatchObject({ confirmation_sent_at: null, reminder_day_before_sent: false, move_count: 1 })
    const ev = await db.query<{ starts_at: Date; ends_at: Date }>('SELECT starts_at, ends_at FROM calendar_events WHERE consultation_slot_id = $1', [id])
    expect(new Date(ev.rows[0].ends_at).toISOString()).toBe(at(16))
    const lead = await db.query<{ t: string }>(
      `SELECT next_action_time::text AS t FROM client_leads WHERE calendar_event_id = (SELECT id FROM calendar_events WHERE consultation_slot_id = $1)`, [id],
    )
    expect(lead.rows[0].t).toBe('15:30:00')
    expect((await asClient<{ starts_at: Date }>(A, 'SELECT starts_at FROM portal.consultations WHERE id = $1', [id]))
      .map((r) => new Date(r.starts_at).toISOString())).toEqual([at(15, 30)])
  })

  it('zrušení smaže rezervaci, událost i kontakt a čas je zase volný', async () => {
    const [{ id }] = await book(A, MA, PA, at(14))
    expect(await code(asClient(B, 'SELECT portal.cancel_consultation($1, $2)', [id, MB]))).toBe('P0002')
    await asClient(A, 'SELECT portal.cancel_consultation($1, $2)', [id, MA])
    expect((await db.query('SELECT 1 FROM consultation_slots')).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM calendar_events')).rows).toHaveLength(0)
    expect((await db.query('SELECT 1 FROM client_leads')).rows).toHaveLength(0)
    expect(await asClient(A, 'SELECT id FROM portal.consultations')).toHaveLength(0)
    expect(await freeAs(A)).toContain(at(14))
  })

  it('méně než 24 hodin před začátkem klient nic nezmění', async () => {
    const soon = new Date(Date.now() + 5 * 3_600_000)
    soon.setUTCSeconds(0, 0)
    const ins = await db.query<{ id: string }>(
      `INSERT INTO consultation_slots (project_id, scheduled_at, channel, client_wish, booked_via, portal_member_id, duration_minutes)
       VALUES ($1, $2, 'meet', 'Brzká', 'prostor', $3, 30) RETURNING id`,
      [PA, soon.toISOString(), MA],
    )
    const id = ins.rows[0].id
    expect(await code(asClient(A, 'SELECT portal.cancel_consultation($1, $2)', [id, MA]))).toBe('P0422')
    expect(await code(asClient(A, 'SELECT * FROM portal.move_consultation($1, $2, $3)', [id, MA, at(14)]))).toBe('P0422')
    expect(canClientChange(soon.toISOString())).toBe(false)
  })

  it('jednu konzultaci jde přesunout nejvýš pětkrát', async () => {
    const [{ id }] = await book(A, MA, PA, at(14))
    const times = [at(14, 30), at(15), at(15, 30), at(14), at(14, 30)]
    for (const t of times) await asClient(A, 'SELECT * FROM portal.move_consultation($1, $2, $3)', [id, MA, t])
    expect(await code(asClient(A, 'SELECT * FROM portal.move_consultation($1, $2, $3)', [id, MA, at(15)]))).toBe('P0429')
  })
})

describe('odkaz /p a projekce', () => {
  it('rezervace z odkazu jde stejnou cestou a klient v prostoru nevidí cizí odkaz', async () => {
    expect(await code(db.query(`SELECT consultation_book($1, $2, 'phone', NULL, 'Hovor', 'x@example.cz', 'tel:+420', 'odkaz', NULL)`, [PA, at(13)]))).toBe('23P01')
    const res = await db.query<{ id: string }>(
      `SELECT consultation_book($1, $2, 'whatsapp', NULL, 'Rychlý dotaz', 'x@example.cz', 'https://wa.me/420', 'odkaz', NULL) AS id`,
      [PA, at(15)],
    )
    const id = res.rows[0].id
    const row = await asClient<Record<string, unknown>>(A, 'SELECT channel, meet_url, meet_pending FROM portal.consultations WHERE id = $1', [id])
    expect(row[0]).toEqual({ channel: 'whatsapp', meet_url: null, meet_pending: false })
    const slot = await db.query<{ meet_status: string | null; booked_via: string }>('SELECT meet_status, booked_via FROM consultation_slots WHERE id = $1', [id])
    expect(slot.rows[0]).toEqual({ meet_status: null, booked_via: 'odkaz' })
  })

  it('zakázka propojená s klientem později přinese i své konzultace', async () => {
    await db.query('SELECT portal.unlink_project($1)', [PA])
    const res = await db.query<{ id: string }>(
      `SELECT consultation_book($1, $2, 'phone', NULL, 'Před propojením', NULL, 'tel:+420', 'odkaz', NULL) AS id`, [PA, at(14)],
    )
    expect(await asClient(A, 'SELECT id FROM portal.consultations')).toHaveLength(0)
    await db.query('SELECT portal.link_project($1, $2)', [A, PA])
    expect((await asClient<{ id: string }>(A, 'SELECT id FROM portal.consultations')).map((r) => r.id)).toEqual([res.rows[0].id])
  })
})

describe('dokončení rezervace', () => {
  const meetUrl = 'https://meet.google.com/abc-defg-hij'

  it('založí Meet, uloží odkaz, pošle potvrzení jednou a zazvoní', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.zakaziq.cz'
    const [{ id }] = await book(A, MA, PA, at(14))
    const createMeet = vi.fn(async () => ({ googleEventId: 'g-1', meetUrl }))
    const send = vi.fn(async () => ({ ok: true as const, id: 'mail-1' }))
    const notify = vi.fn(async () => {})
    const deps = { createMeet, send, notify, googleReady: () => true }

    await finishConsultationBooking(id, {}, deps)
    await finishConsultationBooking(id, { notify: false }, deps)

    expect(createMeet).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    const mail = (send.mock.calls[0] as unknown as [{ to: string; text: string }])[0]
    expect(mail.to).toBe('jana@example.cz')
    expect(mail.text).toContain(meetUrl)
    expect(mail.text).toContain(`https://www.zakaziq.cz/klient/projekt/${PA}`)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0]).toMatchObject([{ type: 'consultation_booked' }])

    const ev = await db.query<{ meet_url: string; google_event_id: string }>('SELECT meet_url, google_event_id FROM calendar_events WHERE consultation_slot_id = $1', [id])
    expect(ev.rows[0]).toEqual({ meet_url: meetUrl, google_event_id: 'g-1' })
    const portal = await asClient<{ meet_url: string; meet_pending: boolean }>(A, 'SELECT meet_url, meet_pending FROM portal.consultations WHERE id = $1', [id])
    expect(portal[0]).toEqual({ meet_url: meetUrl, meet_pending: false })
  })

  it('když Meet selže, rezervace platí, potvrzení odejde bez odkazu a Kryštof dostane upozornění', async () => {
    const [{ id }] = await book(A, MA, PA, at(15))
    const send = vi.fn(async () => ({ ok: true as const, id: 'mail-2' }))
    const notify = vi.fn(async () => {})
    await finishConsultationBooking(id, { notify: false }, {
      createMeet: vi.fn(async () => { throw new Error('Google 500') }),
      send,
      notify,
      googleReady: () => true,
    })
    const slot = await db.query<{ meet_status: string }>('SELECT meet_status FROM consultation_slots WHERE id = $1', [id])
    expect(slot.rows[0].meet_status).toBe('failed')
    expect(notify.mock.calls.map((c) => (c as unknown as [{ type: string }])[0].type)).toEqual(['consultation_meet_failed'])
    const mail = (send.mock.calls[0] as unknown as [{ text: string }])[0]
    expect(mail.text).toContain('Odkaz na Google Meet vám pošlu ještě před začátkem.')
  })

  it('neodeslané potvrzení se zkusí znovu', async () => {
    const [{ id }] = await book(A, MA, PA, at(14))
    const deps = { createMeet: vi.fn(async () => ({ googleEventId: 'g-2', meetUrl })), notify: vi.fn(async () => {}), googleReady: () => true }
    await finishConsultationBooking(id, {}, { ...deps, send: vi.fn(async () => ({ ok: false as const, error: 'Resend 500' })) })
    const after = await db.query<{ confirmation_sent_at: Date | null }>('SELECT confirmation_sent_at FROM consultation_slots WHERE id = $1', [id])
    expect(after.rows[0].confirmation_sent_at).toBeNull()
    const send = vi.fn(async () => ({ ok: true as const, id: 'mail-3' }))
    await finishConsultationBooking(id, { notify: false }, { ...deps, send })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('přesun posune událost v Googlu, zrušení ji smaže', async () => {
    const [{ id }] = await book(A, MA, PA, at(14))
    const moveMeet = vi.fn(async () => {})
    const deleteMeet = vi.fn(async () => {})
    const notify = vi.fn(async () => {})
    const send = vi.fn(async () => ({ ok: true as const, id: 'm' }))
    await finishConsultationMove(id, { googleEventId: 'g-9', minutes: 30 }, { moveMeet, notify, send })
    expect(moveMeet).toHaveBeenCalledWith('g-9', { startsAt: at(14), endsAt: at(14, 30) })
    expect((send.mock.calls[0] as unknown as [{ subject: string }])[0].subject).toContain('přesunutá')
    await finishConsultationCancel({ googleEventId: 'g-9', projectId: PA, clientName: 'Firma A', startsAt: at(14) }, { deleteMeet, notify })
    expect(deleteMeet).toHaveBeenCalledWith('g-9')
    expect(notify).toHaveBeenCalledTimes(2)
  })
})

describe('e-mail a pomocné funkce', () => {
  it('text klienta se v HTML escapuje a odkaz jen https nebo tel', () => {
    const mail = renderConsultationEmail({
      kind: 'booked', startsAt: at(14), minutes: 30, topic: '<script>alert(1)</script>',
      joinUrl: 'javascript:alert(1)', channelLabel: 'Google Meet', manageUrl: null,
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).not.toContain('javascript:')
  })

  it('volné časy se seskupí po pražských dnech', () => {
    const days = groupSlotsByDay([
      { startsAt: at(14), endsAt: at(14, 30) },
      { startsAt: at(14, 30), endsAt: at(15) },
    ])
    expect(days).toEqual([{ day: DAY, slots: expect.any(Array) }])
    expect(days[0].slots).toHaveLength(2)
  })
})
