import { describe, expect, it } from 'vitest'
import {
  covers, endOfMonthIso, mergeRanges, neighbourAnchor, startOfMonthIso, startOfWeekIso,
  viewRange, windowFor, WINDOW_MARGIN_DAYS,
} from '@/lib/admin/calendar-window'
import { addIsoMonths, isoWeekday, pragueDayOf, pragueMinutesOf } from '@/lib/prague-time'
import { isCalendarDay } from '@/app/calendar-actions'

// AD08: kalendář načítá okno kolem zobrazeného měsíce, ne celou historii,
// a kreslí z pražských minut, ne z `getHours()` v zóně prohlížeče.

describe('okno kalendáře', () => {
  it('okno je celý měsíc s rezervou na oba konce', () => {
    expect(windowFor('2026-11-12')).toEqual({ from: '2026-10-25', to: '2026-12-07' })
    expect(WINDOW_MARGIN_DAYS).toBe(7)
  })

  it('rezerva pokryje i týden, který přesahuje do dalšího měsíce', () => {
    // 30. 11. 2026 je pondělí → týden sahá do 6. 12.
    const anchor = '2026-11-30'
    expect(startOfWeekIso(anchor)).toBe('2026-11-30')
    const need = viewRange('week', anchor)
    expect(need).toEqual({ from: '2026-11-30', to: '2026-12-06' })
    expect(covers([windowFor('2026-11-12')], need)).toBe(true)
  })

  it('měsíc vedle už v okně není — ten se dotáhne', () => {
    expect(covers([windowFor('2026-11-12')], viewRange('month', '2027-01-04'))).toBe(false)
    expect(covers([windowFor('2026-11-12')], viewRange('month', '2026-09-10'))).toBe(false)
  })

  it('hranice měsíce drží i u února a přes rok', () => {
    expect(endOfMonthIso('2028-02-10')).toBe('2028-02-29')
    expect(endOfMonthIso('2026-02-10')).toBe('2026-02-28')
    expect(neighbourAnchor('2026-12-31', 1)).toBe('2027-01-01')
    expect(neighbourAnchor('2026-01-15', -1)).toBe('2025-12-01')
    expect(startOfMonthIso('2026-11-30')).toBe('2026-11-01')
  })

  it('krok po měsících nepřeskakuje kvůli krátkému měsíci', () => {
    // 31. 1. + měsíc je konec února, ne 3. 3.
    expect(addIsoMonths('2026-01-31', 1)).toBe('2026-02-28')
    // kotva měsíčního zobrazení je vždy první den, takže krok je plynulý
    let anchor = '2026-01-01'
    const months: string[] = []
    for (let i = 0; i < 4; i++) {
      anchor = neighbourAnchor(anchor, 1)
      months.push(anchor)
    }
    expect(months).toEqual(['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'])
  })

  it('načtené rozsahy se slučují, i když na sebe navazují den po dni', () => {
    expect(mergeRanges([
      { from: '2026-10-25', to: '2026-12-07' },
      { from: '2026-12-08', to: '2027-01-07' },
    ])).toEqual([{ from: '2026-10-25', to: '2027-01-07' }])

    // mezera uprostřed se nepřemostí
    expect(mergeRanges([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-03-01', to: '2026-03-31' },
    ])).toHaveLength(2)
  })

  it('dva sousední dotažené měsíce pokryjí měsíc mezi nimi', () => {
    const loaded = mergeRanges([windowFor('2026-11-01'), windowFor('2026-12-01')])
    expect(covers(loaded, viewRange('month', '2026-12-15'))).toBe(true)
  })
})

describe('vstup z prohlížeče', () => {
  it('kotva musí být skutečné datum, ne jen správný tvar', () => {
    expect(isCalendarDay('2026-11-12')).toBe(true)
    expect(isCalendarDay('2028-02-29')).toBe(true)
    // tvar projde regulárním výrazem, datum neexistuje
    expect(isCalendarDay('2026-99-99')).toBe(false)
    expect(isCalendarDay('2026-13-01')).toBe(false)
    expect(isCalendarDay('2026-02-30')).toBe(false)
    expect(isCalendarDay('2026-00-10')).toBe(false)
    // cokoli jiného
    expect(isCalendarDay('2026-11-12T00:00')).toBe(false)
    expect(isCalendarDay("2026-11-12'; DROP TABLE projects--")).toBe(false)
    expect(isCalendarDay('')).toBe(false)
  })
})

describe('pražský den a minuty', () => {
  it('den se čte v Praze, ne v UTC', () => {
    // 23:30 UTC = 00:30 následujícího dne v Praze (zimní čas)
    expect(pragueDayOf('2026-11-12T23:30:00.000Z')).toBe('2026-11-13')
    expect(pragueMinutesOf('2026-11-12T23:30:00.000Z')).toBe(30)
  })

  it('minuty se nezahazují', () => {
    // 9:15 UTC = 10:15 v Praze (zimní čas)
    expect(pragueMinutesOf('2026-11-12T09:15:00.000Z')).toBe(10 * 60 + 15)
    // letní čas: 8:15 UTC = 10:15 v Praze
    expect(pragueMinutesOf('2026-07-12T08:15:00.000Z')).toBe(10 * 60 + 15)
  })

  it('den v týdnu nezávisí na zóně', () => {
    expect(isoWeekday('2026-11-12')).toBe(4) // čtvrtek
    expect(isoWeekday('2026-11-15')).toBe(0) // nedělní 0 jako v JS
  })
})

// ─── Kolik řádků opravdu přijde ze databáze ─────────────────────────────────

import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll } from 'vitest'
import { setAdminDbForTests, type AdminQuery, type AdminRow } from '@/lib/admin/db'
import { loadCalendarWindow } from '@/lib/admin/calendar'

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      deadline date
    );
    CREATE TABLE consultation_slots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id),
      scheduled_at timestamptz NOT NULL,
      channel text NOT NULL DEFAULT 'phone',
      client_wish text NOT NULL DEFAULT '',
      meeting_link text,
      client_email text
    );
    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      description text,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      event_type text NOT NULL DEFAULT 'manual'
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      contact_name text,
      next_action text,
      next_action_type text,
      next_action_date date,
      next_action_time time,
      phone text, email text,
      lead_status text NOT NULL DEFAULT 'cold',
      estimated_value numeric,
      notes text,
      calendar_event_id uuid
    );
  `)

  // Tři roky provozu: jedna událost, konzultace, deadline a plánovaný hovor
  // na každý den od 2025-01-01 (1095 dní) — přesně to, co dřív celé šlo
  // do prohlížeče.
  await db.exec(`
    INSERT INTO projects (client_name, deadline)
    SELECT 'Klient ' || i, (DATE '2025-01-01' + i)
    FROM generate_series(0, 1094) AS i;

    INSERT INTO consultation_slots (project_id, scheduled_at)
    SELECT id, (deadline + TIME '10:30') AT TIME ZONE 'Europe/Prague' FROM projects;

    INSERT INTO calendar_events (title, starts_at, ends_at)
    SELECT 'Událost ' || i,
           (DATE '2025-01-01' + i + TIME '09:15') AT TIME ZONE 'Europe/Prague',
           (DATE '2025-01-01' + i + TIME '10:45') AT TIME ZONE 'Europe/Prague'
    FROM generate_series(0, 1094) AS i;

    INSERT INTO client_leads (company_name, next_action_date, next_action_time)
    SELECT 'Firma ' || i, (DATE '2025-01-01' + i), TIME '14:00'
    FROM generate_series(0, 1094) AS i;
  `)

  setAdminDbForTests({
    async transaction(queries: AdminQuery[]) {
      const out: AdminRow[][] = []
      for (const query of queries) {
        const res = await db.query<AdminRow>(query.text, [...query.params])
        out.push(res.rows)
      }
      return out
    },
  })
})

afterAll(() => setAdminDbForTests(null))

describe('co přijde ze databáze', () => {
  it('okno jednoho měsíce stáhne desítky řádků, ne tři roky', async () => {
    const data = await loadCalendarWindow(windowFor('2026-11-12'))
    const total = data.consultations.length + data.deadlines.length + data.events.length + data.leads.length

    // 44 dní × 4 druhy záznamů; bez okna by to bylo 1095 × 4 = 4380 řádků.
    expect(total).toBeLessThanOrEqual(4 * 60)
    expect(data.events).toHaveLength(44)
    expect(data.deadlines).toHaveLength(44)
    expect(data.consultations).toHaveLength(44)
    expect(data.leads).toHaveLength(44)
  })

  it('okno drží i krajní dny — první a poslední den jsou uvnitř', async () => {
    const range = windowFor('2026-11-12')
    const data = await loadCalendarWindow(range)
    const days = data.events.map((e) => pragueDayOf(e.starts_at)).sort()
    expect(days[0]).toBe(range.from)
    expect(days[days.length - 1]).toBe(range.to)
  })

  it('události mimo okno nejsou v odpovědi vůbec', async () => {
    const data = await loadCalendarWindow({ from: '2026-11-01', to: '2026-11-03' })
    expect(data.events.map((e) => pragueDayOf(e.starts_at))).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(data.deadlines.map((d) => d.deadline)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })
})
