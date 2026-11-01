import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import {
  buildAccountExport,
  closeAccount,
  eraseCustomer,
  finishScheduledClose,
  getAccountCloseScheduled,
  getAccountClosing,
  reopenAccount,
  runDailyGdpr,
  scheduleCloseAccount,
  unscheduleCloseAccount,
} from '../gdpr'
import { toCsv } from '../csv'
import { crc32, createZip } from '../zip'
import { createWsTestDb, ids, pgliteDriver, seedAccount } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// GDPR (S18, R-054): výmaz zákazníka (historie bez osobních údajů, faktury
// s povinnými údaji), export účtu do ZIPu, zrušení účtu s 30denní lhůtou.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const ctxB: WsContext = { userId: 'user_b', accountId: B.account, role: 'owner' }

const count = async (sql: string, params: unknown[] = []) => Number((await db.query<{ n: number }>(sql, params)).rows[0].n)

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  await db.query(
    `UPDATE ws.requests SET contact = '{"name":"Jana Nováková","phone":"+420600000001","email":"zakaznik@example.cz"}',
       field_values = '{"poznamka":"alergie"}', message = 'Prosím ráno' WHERE id = $1`,
    [A.request],
  )
  await db.query(`UPDATE ws.appointments SET note = 'Jana chce kratší' WHERE id = $1`, [A.appointment])
  await db.query(
    `UPDATE ws.invoices SET direction = 'issued', status = 'issued', issued_on = '2026-10-01',
       counterparty = '{"name":"Jana Nováková","address":"Dlouhá 1, Praha","ico":"","dic":"","email":"zakaznik@example.cz","bank":""}'
     WHERE id = $1`,
    [A.invoice],
  )
  await db.query(
    `INSERT INTO ws.invoices (account_id, business_id, customer_id, direction, status, amount) VALUES ($1, $2, $3, 'issued', 'draft', 500)`,
    [A.account, A.business, A.customer],
  )
  await db.query(
    `INSERT INTO ws.notifications (account_id, business_id, type, title, link) VALUES ($1, $2, 'new_request', 'Nová poptávka: Jana Nováková', $3)`,
    [A.account, A.business, `/w/byznys-a/poptavky?detail=poptavka:${A.request}`],
  )
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db.close()
})

describe('pomůcky', () => {
  it('CSV: středník, uvozovky, BOM a ochrana před vzorcem', () => {
    const csv = toCsv(['a', 'b'], [['x;y', '=SUM(A1)'], [1.5, null]])
    expect(csv.startsWith('﻿a;b\r\n')).toBe(true)
    expect(csv).toContain(`"x;y";'=SUM(A1)`)
    expect(csv).toContain('1.5;\r\n')
  })

  it('ZIP: hlavičky, CRC a počet souborů sedí', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    const zip = createZip([{ name: 'á.txt', data: 'ahoj' }, { name: 'b/c.txt', data: new Uint8Array([1, 2, 3]) }])
    const view = new DataView(zip.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
  })
})

describe('export účtu', () => {
  it('obsahuje CSV všech oblastí a jen data vlastního účtu', async () => {
    await db.query(`INSERT INTO ws.outbound_messages (account_id, business_id, customer_id, type, to_address, subject)
      VALUES ($1, $2, $3, 'customer_custom', 'jana@example.cz', 'Zpráva účtu A'), ($4, $5, $6, 'customer_custom', 'jiny@example.cz', 'Zpráva účtu B')`,
      [A.account, A.business, A.customer, B.account, B.business, B.customer])
    const { zip, missingPdf } = await buildAccountExport(ctxA, { now: new Date('2026-10-17T10:00:00Z') })
    const text = new TextDecoder().decode(zip)
    for (const f of ['CTI-MNE.txt', 'zakaznici.csv', 'zpravy-zakazniku.csv', 'poptavky.csv', 'terminy.csv', 'zakazky.csv', 'faktury.csv', 'prijmy-a-vydaje.csv', 'vernostni-karty.csv']) {
      expect(text).toContain(f)
    }
    expect(text).toContain('Jana Nováková')
    expect(text).toContain('Zpráva účtu A')
    expect(text).toContain('Byznys a')
    expect(text).not.toContain('Byznys b')
    expect(text).not.toContain('Firma b')
    expect(text).not.toContain('Zpráva účtu B')
    // vystavená faktura bez uloženého PDF a bez vykreslovače → v seznamu chybějících
    expect(missingPdf).toEqual(['2026001'])
  })

  it('vykreslené PDF přibalí do složky faktury', async () => {
    const pdf = new TextEncoder().encode('%PDF-test')
    const { zip, missingPdf } = await buildAccountExport(ctxA, { renderPdf: async () => pdf })
    expect(missingPdf).toEqual([])
    expect(new TextDecoder().decode(zip)).toContain('faktury/vystavene/2026001.pdf')
  })
})

describe('výmaz zákazníka', () => {
  it('cizí zákazník = null a nic se nesmaže', async () => {
    expect(await eraseCustomer(ctxB, A.customer)).toBeNull()
    expect(await count('SELECT count(*) AS n FROM ws.customers WHERE id = $1', [A.customer])).toBe(1)
  })

  it('smaže zákazníka a osobní údaje, čísla a faktury s povinnými údaji zůstanou', async () => {
    const r = await eraseCustomer(ctxA, A.customer)
    expect(r).toEqual({ requests: 1, appointments: 1, jobs: 1, invoicesKept: 1, draftsDeleted: 1 })

    expect(await count('SELECT count(*) AS n FROM ws.customers WHERE id = $1', [A.customer])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM ws.loyalty_cards WHERE customer_id = $1', [A.customer])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM ws.customer_segments WHERE customer_id = $1', [A.customer])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM ws.reviews WHERE account_id = $1', [A.account])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM ws.job_updates WHERE account_id = $1', [A.account])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM ws.action_tokens WHERE account_id = $1', [A.account])).toBe(0)
    expect(await count('SELECT count(*) AS n FROM ws.outbound_messages WHERE account_id = $1', [A.account])).toBe(0)
    expect(await count(`SELECT count(*) AS n FROM ws.notifications WHERE account_id = $1 AND title LIKE '%Jana%'`, [A.account])).toBe(0)

    const { rows: [req] } = await db.query<{ contact: Record<string, string>; field_values: object; message: string | null; customer_id: string | null }>(
      'SELECT contact, field_values, message, customer_id FROM ws.requests WHERE id = $1', [A.request])
    expect(req).toEqual({ contact: { name: 'Smazaný zákazník' }, field_values: {}, message: null, customer_id: null })

    const { rows: [appt] } = await db.query<{ note: string | null; starts_at: Date; customer_id: string | null }>(
      'SELECT note, starts_at, customer_id FROM ws.appointments WHERE id = $1', [A.appointment])
    expect(appt.note).toBeNull()
    expect(appt.customer_id).toBeNull()
    expect(appt.starts_at).toBeInstanceOf(Date)

    const { rows: [inv] } = await db.query<{ counterparty: Record<string, string>; anonymize_after: string; customer_id: string | null; amount: string }>(
      'SELECT counterparty, anonymize_after::text, customer_id, amount FROM ws.invoices WHERE id = $1', [A.invoice])
    expect(inv.counterparty.name).toBe('Jana Nováková')
    expect(inv.counterparty.address).toBe('Dlouhá 1, Praha')
    expect(inv.counterparty.email).toBe('')
    expect(inv.anonymize_after).toBe('2037-01-01') // 10 let od konce roku 2026
    expect(inv.customer_id).toBeNull()
    expect(Number(inv.amount)).toBe(1000)
    expect(await count('SELECT count(*) AS n FROM ws.transactions WHERE invoice_id = $1', [A.invoice])).toBe(1)

    expect(await count(`SELECT count(*) AS n FROM ws.audit_log WHERE account_id = $1 AND action = 'customer.erase'`, [A.account])).toBe(1)
  })

  it('účet B zůstal netknutý', async () => {
    expect(await count('SELECT count(*) AS n FROM ws.customers WHERE id = $1', [B.customer])).toBe(1)
    expect(await count('SELECT count(*) AS n FROM ws.reviews WHERE account_id = $1', [B.account])).toBe(1)
  })

  it('po lhůtě cron fakturu anonymizuje', async () => {
    await db.query(`UPDATE ws.invoices SET anonymize_after = current_date WHERE id = $1`, [A.invoice])
    const run = await runDailyGdpr(async () => {})
    expect(run.invoicesAnonymized).toBe(1)
    const { rows: [inv] } = await db.query<{ counterparty: Record<string, string>; anonymize_after: string | null }>(
      'SELECT counterparty, anonymize_after FROM ws.invoices WHERE id = $1', [A.invoice])
    expect(inv.counterparty.name).toBe('Anonymizováno')
    expect(inv.anonymize_after).toBeNull()
  })
})

describe('zrušení účtu', () => {
  it('nastaví výmaz za 30 dní, archivuje byznys a zavře veřejné vstupy', async () => {
    const until = await closeAccount(ctxB)
    expect(until).toBeInstanceOf(Date)
    const days = (until!.getTime() - Date.now()) / 86400000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
    // opakované zrušení lhůtu neprodlouží
    expect((await closeAccount(ctxB))!.getTime()).toBe(until!.getTime())
    expect(await getAccountClosing(ctxB)).toEqual({ requestedAt: expect.any(Date), deleteAfter: until })
    expect(await count('SELECT count(*) AS n FROM ws.businesses WHERE account_id = $1 AND archived_at IS NULL', [B.account])).toBe(0)
    expect(await count(`SELECT count(*) AS n FROM ws.business_by_public_slug('byznys-b')`)).toBe(0)
    expect(await count(`SELECT count(*) AS n FROM ws.integration_by_public_key('pk_${'b'.repeat(24)}')`)).toBe(0)
    expect(await count(`SELECT count(*) AS n FROM ws.outbound_messages WHERE account_id = $1 AND status = 'queued'`, [B.account])).toBe(0)
  })

  it('ve lhůtě jde obnovit, vrátí jen byznysy archivované zrušením', async () => {
    expect(await reopenAccount(ctxB)).toBe(true)
    expect(await getAccountClosing(ctxB)).toBeNull()
    expect(await count('SELECT count(*) AS n FROM ws.businesses WHERE account_id = $1 AND archived_at IS NULL', [B.account])).toBe(1)
    expect(await reopenAccount(ctxB)).toBe(false)
  })

  it('cron smaže účet po lhůtě celý a vrátí organizaci ke smazání v Clerku', async () => {
    await closeAccount(ctxB)
    expect((await runDailyGdpr(async () => {})).accountsDeleted).toBe(0) // lhůta neuplynula
    await db.query(`UPDATE ws.accounts SET delete_after = now() - interval '1 minute' WHERE id = $1`, [B.account])
    const orgs: string[] = []
    const run = await runDailyGdpr(async (org) => {
      orgs.push(org)
      throw new Error('Clerk nedostupný') // chyba Clerku výmaz dat nezastaví
    })
    expect(run).toMatchObject({ accountsDeleted: 1, orgsFailed: 1 })
    expect(orgs).toEqual(['org_b'])

    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = 'ws' AND column_name = 'account_id'`)
    for (const { table_name } of rows) {
      expect(await count(`SELECT count(*) AS n FROM ws.${table_name} WHERE account_id = $1`, [B.account]), table_name).toBe(0)
    }
    expect(await count('SELECT count(*) AS n FROM ws.accounts WHERE id = $1', [A.account])).toBe(1)
    // a znovu založit jde (stejná data, nový účet)
    await seedAccount(db, 'b')
  })
})

describe('zrušení ke konci zaplaceného období (R-074, migrace 097)', () => {
  const periodEnd = async (status: string, cancelling: boolean) =>
    db.query(
      `UPDATE ws.subscriptions SET status = $2, cancel_at_period_end = $3, current_period_end = now() + interval '10 days' WHERE account_id = $1`,
      [B.account, status, cancelling],
    )
  const openBusinesses = () => count('SELECT count(*) AS n FROM ws.businesses WHERE account_id = $1 AND archived_at IS NULL', [B.account])

  it('předplatné obnovené v Portalu zrušení zruší', async () => {
    await periodEnd('active', true)
    expect(await scheduleCloseAccount(ctxB)).toBe(true)
    expect(await finishScheduledClose(ctxB)).toBeNull()
    expect(await getAccountCloseScheduled(ctxB)).not.toBeNull()

    await periodEnd('active', false)
    expect(await finishScheduledClose(ctxB)).toBeNull()
    expect(await getAccountCloseScheduled(ctxB)).toBeNull()
    expect(await unscheduleCloseAccount(ctxB)).toBe(false)
  })

  it('do konce období účet běží, potom ho cron zavře a začne lhůta', async () => {
    await periodEnd('active', true)
    expect(await scheduleCloseAccount(ctxB)).toBe(true)
    const scheduled = await getAccountCloseScheduled(ctxB)
    expect(scheduled?.closesAt).toBeInstanceOf(Date)
    expect(await openBusinesses()).toBe(1)
    expect(await getAccountClosing(ctxB)).toBeNull()

    // cron obnoví předplatné ze Stripe (tady: skončilo) a účet zavře
    const synced: string[] = []
    const run = await runDailyGdpr(async () => {}, async (id) => {
      synced.push(id)
      await db.query(`UPDATE ws.subscriptions SET status = 'canceled' WHERE stripe_subscription_id = $1`, [id])
    })
    expect(synced).toEqual(['sub_b'])
    expect(run).toMatchObject({ accountsClosed: 1, accountsDeleted: 0 })
    expect(await getAccountCloseScheduled(ctxB)).toBeNull()
    expect(await getAccountClosing(ctxB)).not.toBeNull()
    expect(await openBusinesses()).toBe(0)
    // zavřený účet už znovu naplánovat nejde
    expect(await scheduleCloseAccount(ctxB)).toBe(false)
  })

  it('účet A se nedotkne', async () => {
    expect(await finishScheduledClose(ctxA)).toBeNull()
    expect(await count('SELECT count(*) AS n FROM ws.accounts WHERE id = $1 AND close_scheduled_at IS NULL AND delete_after IS NULL', [A.account])).toBe(1)
  })
})
