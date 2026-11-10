import type { PGlite } from '@electric-sql/pglite'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asApp, createWsTestDb, ids, pgCode, WS_ADMIN_TABLES, WS_GLOBAL_TABLES, WS_MIGRATIONS, WS_SYSTEM_TABLES } from './helpers/ws-pglite'

// Schéma ws (migrace 064+): idempotence, oddělení účtů pro každou tabulku
// a pravidla, která hlídá databáze (překryv termínů, razítka, webhooky).

let db: PGlite
let fingerprints: Record<string, number>[]
let accountTables: { table: string; column: string }[]

const A = ids('a')
const B = ids('b')

beforeAll(async () => {
  ;({ db, fingerprints } = await createWsTestDb())
  const { rows } = await db.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'ws' AND table_type = 'BASE TABLE' ORDER BY table_name
  `)
  accountTables = rows
    .map((r) => r.table_name)
    .filter((t) => !WS_SYSTEM_TABLES.includes(t) && !WS_GLOBAL_TABLES.includes(t) && !WS_ADMIN_TABLES.includes(t))
    .map((t) => ({ table: t, column: t === 'accounts' ? 'id' : 'account_id' }))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('migrace ws', () => {
  it('jsou číslované od 064 a navazují bez mezer (mezery jen pro migrace mimo ws)', () => {
    const numbers = WS_MIGRATIONS.map((f) => Number(f.slice(0, 3)))
    expect(numbers[0]).toBe(64)
    const all = readdirSync(path.join(process.cwd(), 'migrations'))
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .map((f) => Number(f.slice(0, 3)))
      .filter((n) => n >= 64)
      .sort((a, b) => a - b)
    all.forEach((n, i) => expect(n).toBe(64 + i))
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('projdou dvakrát po sobě a schéma zůstane stejné', () => {
    expect(fingerprints[0].tables).toBeGreaterThan(30)
    expect(fingerprints[1]).toEqual(fingerprints[0])
  })

  it('každá tabulka s daty účtu má account_id, zapnuté RLS a politiku', async () => {
    expect(accountTables.length).toBeGreaterThanOrEqual(30)
    for (const { table, column } of accountTables) {
      const { rows } = await db.query<{ rls: boolean; has_col: boolean; policies: number }>(
        `SELECT c.relrowsecurity AS rls,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'ws' AND table_name = $1 AND column_name = $2) AS has_col,
                (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'ws' AND tablename = $1) AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'ws' AND c.relname = $1`,
        [table, column],
      )
      expect({ table, ...rows[0] }).toEqual({ table, rls: true, has_col: true, policies: 1 })
    }
  })

  it('systémové tabulky nemají osobní údaje (žádný payload, e-mail ani telefon)', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'ws' AND table_name = ANY($1)`,
      [WS_SYSTEM_TABLES],
    )
    const columns = rows.map((r) => `${r.table_name}.${r.column_name}`)
    expect(columns.filter((c) => /payload|email|phone|ip|body|name/.test(c.split('.')[1]))).toEqual([])
  })

  it('novinky ZakazIQ ws_app jen čte, nezapíše', async () => {
    await db.query(`INSERT INTO ws.product_news (title, body, published_at) VALUES ('Novinka', 'Text', now())`)
    const read = await asApp(db, A.account, (tx) => tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.product_news`))
    expect(read.rows[0].n).toBe(1)
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query(`INSERT INTO ws.product_news (title, body) VALUES ('x', 'y')`)))).toBe('42501')
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query(`UPDATE ws.product_news SET title = 'x'`)))).toBe('42501')
    await db.query(`DELETE FROM ws.product_news`)
  })

  it('interní tabulky adminu mají RLS, ale ws_app k nim nesmí vůbec', async () => {
    for (const table of WS_ADMIN_TABLES) {
      const { rows } = await db.query<{ rls: boolean; policies: number }>(
        `SELECT c.relrowsecurity AS rls, (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'ws' AND tablename = $1) AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'ws' AND c.relname = $1`,
        [table],
      )
      expect({ table, ...rows[0] }).toEqual({ table, rls: true, policies: 1 })
      for (const sql of [`SELECT * FROM ws.${table}`, `DELETE FROM ws.${table}`, `INSERT INTO ws.${table} (account_id) VALUES ('${A.account}')`]) {
        expect({ table, sql, code: await pgCode(asApp(db, A.account, (tx) => tx.query(sql))) }).toEqual({ table, sql, code: '42501' })
      }
    }
  })

  it('tabulky v public migrace nemění (jen ws)', async () => {
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`)
    expect(rows[0].n).toBe(1)
  })
})

describe('oddělení účtů (RLS jako ws_app)', () => {
  it('testovací data pokrývají každou tabulku pro oba účty', async () => {
    for (const { table, column } of accountTables) {
      for (const acc of [A.account, B.account]) {
        const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.${table} WHERE ${column} = $1`, [acc])
        expect({ table, acc, has: rows[0].n > 0 }).toEqual({ table, acc, has: true })
      }
    }
  })

  it('účet A vidí jen své řádky v každé tabulce', async () => {
    for (const { table, column } of accountTables) {
      const own = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.${table} WHERE ${column} = $1`, [A.account])
      const seen = await asApp(db, A.account, (tx) =>
        tx.query<{ total: number; foreign: number }>(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE ${column} <> $1)::int AS foreign FROM ws.${table}`,
          [A.account],
        ),
      )
      expect({ table, ...seen.rows[0] }).toEqual({ table, total: own.rows[0].n, foreign: 0 })
    }
  })

  it('bez nastaveného účtu nevidí nic', async () => {
    for (const { table } of accountTables) {
      const seen = await asApp(db, null, (tx) => tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.${table}`))
      expect({ table, n: seen.rows[0].n }).toEqual({ table, n: 0 })
    }
  })

  it('účet A nezmění ani nesmaže řádky účtu B', async () => {
    for (const { table, column } of accountTables) {
      for (const sql of [
        `UPDATE ws.${table} SET ${column} = ${column} WHERE ${column} = $1`,
        `DELETE FROM ws.${table} WHERE ${column} = $1`,
      ]) {
        const outcome = await asApp(db, A.account, async (tx) => {
          try {
            return (await tx.query(sql, [B.account])).affectedRows ?? 0
          } catch (e) {
            return (e as { code?: string }).code
          }
        })
        // audit_log: ws_app nemá UPDATE/DELETE vůbec (42501)
        const expected = table === 'audit_log' ? '42501' : 0
        expect({ table, sql: sql.split(' ')[0], outcome }).toEqual({ table, sql: sql.split(' ')[0], outcome: expected })
      }
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.${table} WHERE ${column} = $1`, [B.account])
      expect({ table, left: rows[0].n > 0 }).toEqual({ table, left: true })
    }
  })

  it('účet A nezapíše řádek s account_id účtu B', async () => {
    const code = await pgCode(
      asApp(db, A.account, (tx) =>
        tx.query(`INSERT INTO ws.customers (account_id, name) VALUES ($1, 'Cizí')`, [B.account]),
      ),
    )
    expect(code).toBe('42501')
  })

  it('účet A nepřipojí ke své poptávce zákazníka účtu B, i když zná jeho UUID', async () => {
    const code = await pgCode(
      asApp(db, A.account, (tx) =>
        tx.query(`INSERT INTO ws.requests (account_id, business_id, customer_id) VALUES ($1, $2, $3)`, [
          A.account,
          A.business,
          B.customer,
        ]),
      ),
    )
    expect(code).toBe('23503')
  })

  it('účet A nezaloží termín u pracovníka účtu B', async () => {
    const code = await pgCode(
      asApp(db, A.account, (tx) =>
        tx.query(
          `INSERT INTO ws.appointments (account_id, business_id, staff_id, starts_at, ends_at)
           VALUES ($1, $2, $3, '2026-12-01 09:00+01', '2026-12-01 10:00+01')`,
          [A.account, A.business, B.staff],
        ),
      ),
    )
    expect(code).toBe('23503')
  })

  it('ws_app nevidí do admin tabulek v public a nemůže měnit schéma', async () => {
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query('SELECT * FROM public.projects')))).toBe('42501')
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query('CREATE TABLE ws.cizi (id int)')))).toBe('42501')
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query('ALTER TABLE ws.customers DISABLE ROW LEVEL SECURITY')))).toBe('42501')
  })

  it('ws.membership_for_user najde účet a roli bez kontextu, přímý SELECT ne', async () => {
    const res = await asApp(db, null, async (tx) => ({
      viaFunction: (await tx.query(`SELECT account_id, role FROM ws.membership_for_user('user_b')`)).rows,
      direct: (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ws.members`)).rows[0].n,
      unknown: (await tx.query(`SELECT * FROM ws.membership_for_user('user_neni')`)).rows,
      // Zvolený cizí účet nic nezmění — vrátí se jen vlastní členství.
      foreign: (await tx.query(`SELECT account_id FROM ws.membership_for_user('user_b', '${A.account}')`)).rows,
    }))
    expect(res).toEqual({
      viaFunction: [{ account_id: B.account, role: 'owner' }],
      direct: 0,
      unknown: [],
      foreign: [{ account_id: B.account }],
    })
  })

  it('pomocné funkce migrací ws_app spustit nesmí', async () => {
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query(`SELECT ws.enable_account_rls('ws.customers')`)))).toBe('42501')
  })
})

describe('pravidla hlídaná databází', () => {
  const visit = (staff: string, from: string, to: string, status = 'confirmed', kind = 'visit') =>
    asApp(db, A.account, (tx) =>
      tx.query(
        `INSERT INTO ws.appointments (account_id, business_id, kind, staff_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [A.account, A.business, kind, staff, from, to, status],
      ),
    )

  it('překrývající se termín u stejného pracovníka selže (23P01)', async () => {
    // v datech: 2026-10-01 9:00–10:00
    expect(await pgCode(visit(A.staff, '2026-10-01 09:30+02', '2026-10-01 10:30+02'))).toBe('23P01')
  })

  it('navazující termín, zrušený termín a jiný pracovník projdou', async () => {
    expect(await pgCode(visit(A.staff, '2026-10-01 10:00+02', '2026-10-01 11:00+02'))).toBeNull()
    expect(await pgCode(visit(A.staff, '2026-10-01 09:15+02', '2026-10-01 09:45+02', 'cancelled'))).toBeNull()
    const staff2 = await asApp(db, A.account, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO ws.staff (account_id, business_id, name) VALUES ($1, $2, 'Druhý') RETURNING id`,
        [A.account, A.business],
      ),
    )
    expect(await pgCode(visit(staff2.rows[0].id, '2026-10-01 09:00+02', '2026-10-01 10:00+02'))).toBeNull()
  })

  it('blokace (dovolená) se s návštěvou taky nepřekryje', async () => {
    expect(await pgCode(visit(A.staff, '2026-10-01 08:00+02', '2026-10-01 18:00+02', 'confirmed', 'block'))).toBe('23P01')
  })

  it('návštěva bez pracovníka neprojde', async () => {
    expect(await pgCode(visit(null as unknown as string, '2026-11-01 09:00+01', '2026-11-01 10:00+01'))).toBe('23514')
  })

  it('druhé razítko za stejnou návštěvu selže (23505)', async () => {
    const stamp = (card: string) =>
      asApp(db, A.account, (tx) =>
        tx.query(
          `INSERT INTO ws.loyalty_events (account_id, business_id, card_id, appointment_id, kind, delta)
           VALUES ($1, $2, $3, $4, 'stamp', 1)`,
          [A.account, A.business, card, A.appointment],
        ),
      )
    expect(await pgCode(stamp(A.card))).toBe('23505')

    // ani na jinou kartu
    const other = await asApp(db, A.account, async (tx) => {
      const c = await tx.query<{ id: string }>(
        `INSERT INTO ws.customers (account_id, name) VALUES ($1, 'Jiná') RETURNING id`,
        [A.account],
      )
      return tx.query<{ id: string }>(
        `INSERT INTO ws.loyalty_cards (account_id, business_id, program_id, customer_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [A.account, A.business, A.program, c.rows[0].id],
      )
    })
    expect(await pgCode(stamp(other.rows[0].id))).toBe('23505')
  })

  it('ruční změna razítek bez důvodu neprojde', async () => {
    const code = await pgCode(
      asApp(db, A.account, (tx) =>
        tx.query(
          `INSERT INTO ws.loyalty_events (account_id, business_id, card_id, kind, delta) VALUES ($1, $2, $3, 'manual', 1)`,
          [A.account, A.business, A.card],
        ),
      ),
    )
    expect(code).toBe('23514')
  })

  it('zákazník je v účtu unikátní podle telefonu i e-mailu, mezi účty se smí opakovat', async () => {
    const insert = (phone: string | null, email: string | null) =>
      asApp(db, A.account, (tx) =>
        tx.query(`INSERT INTO ws.customers (account_id, name, phone, email) VALUES ($1, 'Test', $2, $3)`, [
          A.account,
          phone,
          email,
        ]),
      )
    expect(await pgCode(insert('+420600000001', null))).toBe('23505')
    expect(await pgCode(insert(null, 'zakaznik@example.cz'))).toBe('23505')
    expect(await pgCode(insert(null, 'Velka@Example.cz'))).toBe('23514')
    expect(await pgCode(insert('600 000 002', null))).toBe('23514')
    // stejný telefon i e-mail má v datech i účet B
    expect(await pgCode(insert('+420600000099', 'novy@example.cz'))).toBeNull()
  })

  it('duplicitní Stripe událost se zpracuje jen jednou', async () => {
    const claim = () =>
      asApp(db, null, (tx) =>
        tx.query<{ id: string }>(
          `INSERT INTO ws.stripe_events (id, type) VALUES ('evt_test_1', 'invoice.paid') ON CONFLICT (id) DO NOTHING RETURNING id`,
        ),
      )
    expect((await claim()).rows).toHaveLength(1)
    expect((await claim()).rows).toHaveLength(0)
    expect(
      await pgCode(asApp(db, null, (tx) => tx.query(`INSERT INTO ws.stripe_events (id, type) VALUES ('evt_test_1', 'x')`))),
    ).toBe('23505')
  })

  it('stejný webhook Clerku podruhé neprojde', async () => {
    const claim = () =>
      asApp(db, null, (tx) =>
        tx.query(
          `INSERT INTO ws.webhook_events (source, id, type) VALUES ('clerk', 'msg_1', 'organization.created') ON CONFLICT DO NOTHING RETURNING id`,
        ),
      )
    expect((await claim()).rows).toHaveLength(1)
    expect((await claim()).rows).toHaveLength(0)
  })

  it('číslo vystavené faktury je v účtu jen jednou, slug byznysu globálně jen jednou', async () => {
    expect(
      await pgCode(
        asApp(db, A.account, (tx) =>
          tx.query(`INSERT INTO ws.invoices (account_id, business_id, number, amount) VALUES ($1, $2, '2026001', 5)`, [
            A.account,
            A.business,
          ]),
        ),
      ),
    ).toBe('23505')
    expect(
      await pgCode(
        asApp(db, A.account, (tx) =>
          tx.query(`INSERT INTO ws.businesses (account_id, name, slug) VALUES ($1, 'Kopie', 'byznys-b')`, [A.account]),
        ),
      ),
    ).toBe('23505')
  })

  it('updated_at se při změně sám posune', async () => {
    const res = await asApp(db, A.account, async (tx) => {
      const before = await tx.query<{ t: Date }>(`SELECT updated_at AS t FROM ws.services WHERE id = $1`, [A.service])
      const after = await tx.query<{ t: Date }>(`UPDATE ws.services SET name = 'Nová' WHERE id = $1 RETURNING updated_at AS t`, [A.service])
      return [before.rows[0].t, after.rows[0].t]
    })
    expect(res[1].getTime()).toBeGreaterThan(res[0].getTime())
  })
})
