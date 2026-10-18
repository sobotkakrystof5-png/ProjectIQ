import { createHmac } from 'crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests } from '../db'
import type { WsContext } from '../context'
import { completeVisit } from '../loyalty'
import { fillTemplate } from '../email/catalog'
import { composeCustomerEmail, previewCustomerEmail } from '../email/compose'
import { renderEmail, safeUrl } from '../email/layout'
import { setLinkSecretForTests, signLink, verifyLink } from '../email/links'
import { applyActionLink, peekActionLink } from '../email/action-link'
import { notifyBookingConfirmed, notifyNewRequest, notifyAppointmentMoved, notifyRequestDeclined, cancelPendingNotice, notifyVisitPaid, loadSender } from '../email/notify'
import { cancelQueuedCustomerMessage, enqueueEmail, flushAccount, MAX_ATTEMPTS } from '../email/queue'
import { setEmailTransportForTests, type OutgoingEmail, type SendResult } from '../email/transport'
import { sendOutreachDraft } from '../email/outbox'
import { mailtoAddress } from '../email/mailto'
import { unsubscribeCustomer } from '../email/public-links'
import { queueReminders } from '../email/scheduled'
import { verifySvix } from '../email/resend-webhook'
import { createDraft } from '../outreach'
import { createWsTestDb, ids, pgliteDriver } from './helpers/ws-pglite'

vi.mock('server-only', () => ({}))

// E-maily (S15): fronta opakuje a nezdvojí, podepsané odkazy nejdou použít
// dvakrát ani po expiraci, vypnutý typ se neodešle, odhlášený zákazník
// nedostane hromadnou zprávu a celá cesta poptávka → potvrzení z e-mailu →
// připomínka → poděkování projde.

let db: PGlite
const A = ids('a')
const B = ids('b')
const ctxA: WsContext = { userId: 'user_a', accountId: A.account, role: 'owner' }
const scopeA = { accountId: A.account }

let sent: OutgoingEmail[] = []
let next: () => SendResult = () => ({ ok: true, providerId: `re_${sent.length}` })

const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

async function newRequest(start: string | null, status = 'new'): Promise<string> {
  const [r] = await rows<{ id: string }>(
    `INSERT INTO ws.requests (account_id, business_id, customer_id, service_id, wanted_start, wanted_end, source, status, message)
     VALUES ($1, $2, $3, $4, $5, $6, 'web', $7, 'Prosím odpoledne') RETURNING id`,
    [A.account, A.business, A.customer, A.service, start, start ? new Date(new Date(start).getTime() + 3_600_000).toISOString() : null, status],
  )
  return r.id
}

const messages = (type?: string) =>
  rows<{ id: string; type: string; status: string; to_address: string; subject: string; attempts: number; dedupe_key: string | null; last_error: string | null }>(
    `SELECT id, type, status, to_address, subject, attempts, dedupe_key, last_error FROM ws.outbound_messages
     WHERE account_id = $1 ${type ? 'AND type = $2' : ''} ORDER BY created_at`,
    type ? [A.account, type] : [A.account],
  )

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  setLinkSecretForTests('test-pepper-'.repeat(4))
  setEmailTransportForTests({
    send: async (m) => {
      const r = next()
      if (r.ok) sent.push(m)
      return r
    },
  })
  await db.query(`UPDATE ws.members SET email = 'majitel@example.cz' WHERE account_id = $1`, [A.account])
  await db.query(`UPDATE ws.customers SET contact_consent_at = now() WHERE account_id = $1`, [A.account])
  await db.query(`DELETE FROM ws.outbound_messages`)
  await db.query(`DELETE FROM ws.message_settings`)
  await db.query(`DELETE FROM ws.action_tokens`)
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  setEmailTransportForTests(undefined)
  setLinkSecretForTests(null)
  await db?.close()
})

beforeEach(async () => {
  sent = []
  next = () => ({ ok: true, providerId: `re_${sent.length}` })
  await db.query(`DELETE FROM ws.outbound_messages`)
  await db.query(`UPDATE ws.customers SET contact_consent_at = now(), unsubscribed_at = NULL, ended_at = NULL WHERE id = $1`, [A.customer])
})

describe('šablony a rozložení', () => {
  it('zakóduje adresu pro mailto bez možnosti vložit další parametr', () => {
    expect(mailtoAddress('user?bcc=attacker@example.cz')).toBe('user%3Fbcc%3Dattacker@example.cz')
    expect(mailtoAddress('neplatny')).toBeNull()
  })

  it('doplní proměnné a prázdnou vynechá i s mezerou', () => {
    expect(fillTemplate('Termín {termin} pro {jmeno}.', { termin: 'pátek v 9:00' })).toBe('Termín pátek v 9:00 pro.')
  })

  it('escapuje text i jméno firmy, nepovolí javascript: odkaz', () => {
    const r = renderEmail({
      brand: { name: '<script>alert(1)</script>', color: '#ffffff' },
      subject: 'Ahoj\r\nBcc: x@y.cz',
      body: 'Text <b>tučně</b> a https://example.cz/?a=1&b=2',
      blocks: [{ kind: 'buttons', items: [{ label: 'Klik', url: 'javascript:alert(1)' }] }],
    })
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;b&gt;tučně&lt;/b&gt;')
    expect(r.html).not.toContain('javascript:')
    expect(r.html).toContain('href="https://example.cz/?a=1&amp;b=2"')
    expect(r.subject).toBe('Ahoj Bcc: x@y.cz')
    expect(safeUrl('data:text/html,x')).toBeNull()
  })

  it('vykreslí uplatněnou kartu jako tabulku se stejným stavem a bez obrázku', () => {
    const email = renderEmail({
      brand: { name: 'Kadeřnictví', color: '#23478b' },
      subject: 'Děkujeme',
      body: 'Děkujeme za návštěvu.',
      blocks: [{ kind: 'card', stamps: 5, needed: 5, reward: 'Zvolená odměna', status: 'redeemed' }],
    })
    expect(email.html).toContain('Věrnostní karta · 5 z 5 razítek')
    expect(email.html).toContain('Odměna uplatněna. Začíná nová karta.')
    expect(email.html).not.toContain('<img')
    expect(email.text).toContain('Odměna uplatněna. Začíná nová karta.')
  })

  it('náhled v Nastavení skládá stejný e-mail jako odeslaný (jiné jsou jen údaje)', () => {
    const brand = { name: 'Kadeřnictví Lenka', color: null }
    const preview = previewCustomerEmail({ type: 'booking_confirmed', brand, subject: 'Vlastní {termin}', body: 'Dobrý den, {termin}.' })
    const real = composeCustomerEmail({
      type: 'booking_confirmed',
      brand,
      subject: 'Vlastní {termin}',
      body: 'Dobrý den, {termin}.',
      values: { termin: 'pátek 13. listopadu v 9:00', sluzba: 'Střih a foukaná' },
      extras: { calendarUrl: 'https://www.zakaziq.cz/' },
    })
    expect(real.subject).toBe(preview.subject)
    expect(real.html).toBe(preview.html)
  })
})

describe('podepsané odkazy', () => {
  it('ověří vlastní podpis a odmítne změněný, cizí druh i nesmysl', () => {
    const t = signLink({ kind: 'u', accountId: A.account, id: A.customer })
    expect(verifyLink(t, 'u')).toEqual({ kind: 'u', accountId: A.account, id: A.customer })
    expect(verifyLink(t, 'n')).toBeNull()
    const tampered = t.slice(0, 5) + (t[5] === 'A' ? 'B' : 'A') + t.slice(6)
    expect(verifyLink(tampered, 'u')).toBeNull()
    const other = signLink({ kind: 'u', accountId: B.account, id: A.customer })
    expect(verifyLink(t.split('.')[0] + '.' + other.split('.')[1], 'u')).toBeNull()
    expect(verifyLink('u.x', 'u')).toBeNull()
  })
})

describe('fronta', () => {
  const email = { subject: 'Ahoj', html: '<p>Ahoj</p>', text: 'Ahoj' }

  it('odešle, obsah po odeslání smaže a stejnou událost nezařadí dvakrát', async () => {
    const id = await enqueueEmail(scopeA, { businessId: A.business, type: 'reminder', to: 'Zakaznik@Example.cz', fromName: 'Byznys', email, dedupeKey: 'reminder:x' })
    expect(id).not.toBeNull()
    expect(await enqueueEmail(scopeA, { businessId: A.business, type: 'reminder', to: 'zakaznik@example.cz', fromName: 'Byznys', email, dedupeKey: 'reminder:x' })).toBeNull()
    const r = await flushAccount(scopeA)
    expect(r.sent).toBe(1)
    expect(sent.map((m) => [m.to, m.id])).toEqual([['zakaznik@example.cz', id]])
    const [m] = await rows<{ status: string; html: string | null }>(`SELECT status, payload->>'html' AS html FROM ws.outbound_messages WHERE id = $1`, [id])
    expect(m).toEqual({ status: 'sent', html: null })
    expect((await flushAccount(scopeA)).sent).toBe(0)
  })

  it('chybu zkusí znovu později, po posledním pokusu ji vzdá', async () => {
    next = () => ({ ok: false, error: 'network', permanent: false })
    const id = await enqueueEmail(scopeA, { businessId: A.business, type: 'reminder', to: 'a@example.cz', fromName: 'B', email })
    await flushAccount(scopeA)
    let [m] = await rows<{ status: string; attempts: number; due: boolean }>(`SELECT status, attempts, next_attempt_at > now() AS due FROM ws.outbound_messages WHERE id = $1`, [id])
    expect(m).toEqual({ status: 'queued', attempts: 1, due: true })
    // Hned znovu nic (čeká na další pokus).
    expect((await flushAccount(scopeA)).retried).toBe(0)
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await db.query(`UPDATE ws.outbound_messages SET next_attempt_at = now() - interval '1 minute' WHERE id = $1`, [id])
      await flushAccount(scopeA)
    }
    ;[m] = await rows(`SELECT status, attempts, true AS due FROM ws.outbound_messages WHERE id = $1`, [id])
    expect(m).toEqual({ status: 'failed', attempts: MAX_ATTEMPTS, due: true })
    expect(sent).toHaveLength(0)
  })

  it('dva souběžné běhy jednu zprávu neodešlou dvakrát', async () => {
    for (let i = 0; i < 4; i++) await enqueueEmail(scopeA, { businessId: A.business, type: 'reminder', to: `z${i}@example.cz`, fromName: 'B', email })
    const [x, y] = await Promise.all([flushAccount(scopeA), flushAccount(scopeA)])
    expect(x.sent + y.sent).toBe(4)
    expect(new Set(sent.map((m) => m.id)).size).toBe(4)
  })

  it('prošlou zprávu (připomínka po termínu) zruší místo odeslání', async () => {
    const id = await enqueueEmail(scopeA, { businessId: A.business, type: 'reminder', to: 'a@example.cz', fromName: 'B', email, validUntil: new Date(Date.now() - 1000) })
    expect((await flushAccount(scopeA)).expired).toBe(1)
    const [m] = await rows<{ status: string }>(`SELECT status FROM ws.outbound_messages WHERE id = $1`, [id])
    expect(m.status).toBe('cancelled')
    expect(sent).toHaveLength(0)
  })

  it('cizí účet frontu jiného účtu neodešle', async () => {
    await enqueueEmail(scopeA, { businessId: A.business, type: 'reminder', to: 'a@example.cz', fromName: 'B', email })
    expect((await flushAccount({ accountId: B.account })).sent).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('osobní zpráva může odejít i po odhlášení, nabídka se zastaví', async () => {
    await db.query(`UPDATE ws.customers SET unsubscribed_at = now() WHERE id = $1`, [A.customer])
    const personalId = await enqueueEmail(scopeA, { businessId: A.business, customerId: A.customer, type: 'customer_custom', to: 'zakaznik@example.cz', fromName: 'B', email })
    const offerId = await enqueueEmail(scopeA, { businessId: A.business, customerId: A.customer, type: 'customer_offer', to: 'zakaznik@example.cz', fromName: 'B', email })
    expect((await flushAccount(scopeA)).sent).toBe(1)
    expect(sent.map((m) => m.id)).toEqual([personalId])
    const status = await rows<{ id: string; status: string }>(`SELECT id, status FROM ws.outbound_messages WHERE id IN ($1, $2) ORDER BY id`, [personalId, offerId])
    expect(status.map((row) => [row.id, row.status])).toEqual([[personalId, 'sent'], [offerId, 'cancelled']].sort(([a], [b]) => String(a).localeCompare(String(b))))
  })

  it('ruční e-mail jde vrátit jen během čekání ve frontě', async () => {
    const id = await enqueueEmail(scopeA, { businessId: A.business, customerId: A.customer, type: 'customer_custom', to: 'zakaznik@example.cz', fromName: 'B', email, sendAt: new Date(Date.now() + 60_000) })
    expect(id).not.toBeNull()
    expect(await cancelQueuedCustomerMessage(scopeA, A.business, A.customer, id!)).toBe(true)
    expect(await cancelQueuedCustomerMessage(scopeA, A.business, A.customer, id!)).toBe(false)
    const [message] = await rows<{ status: string }>(`SELECT status FROM ws.outbound_messages WHERE id = $1`, [id])
    expect(message.status).toBe('cancelled')
  })
})

describe('jednorázový odkaz majitele', () => {
  async function tokenFor(requestId: string, expires = "now() + interval '72 hours'"): Promise<string> {
    const [t] = await rows<{ id: string }>(
      `INSERT INTO ws.action_tokens (account_id, business_id, request_id, expires_at) VALUES ($1, $2, $3, ${expires}) RETURNING id`,
      [A.account, A.business, requestId],
    )
    return signLink({ kind: 'a', accountId: A.account, id: t.id })
  }

  it('potvrdí poptávku jednou, podruhé ani jiný odkaz k téže poptávce už ne', async () => {
    const req = await newRequest('2026-11-03T09:00:00Z')
    const t1 = await tokenFor(req)
    const t2 = await tokenFor(req)
    expect((await peekActionLink(t1)).ok).toBe(true)
    const res = await applyActionLink(t1)
    expect(res.ok).toBe(true)
    const [r] = await rows<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [req])
    expect(r.status).toBe('confirmed')
    expect(await applyActionLink(t1)).toEqual({ ok: false, reason: 'used' })
    expect(await applyActionLink(t2)).toEqual({ ok: false, reason: 'used' })
    expect(await peekActionLink(t1)).toEqual({ ok: false, reason: 'used' })
  })

  it('po expiraci nejde použít a změněný odkaz neplatí', async () => {
    const req = await newRequest('2026-11-04T09:00:00Z')
    const old = await tokenFor(req, "now() - interval '1 minute'")
    expect(await applyActionLink(old)).toEqual({ ok: false, reason: 'expired' })
    const fresh = await tokenFor(req)
    expect(await applyActionLink(fresh.slice(0, -2) + 'xx')).toEqual({ ok: false, reason: 'invalid' })
    const [r] = await rows<{ status: string }>(`SELECT status FROM ws.requests WHERE id = $1`, [req])
    expect(r.status).toBe('new')
  })

  it('obsazený čas odkaz nespotřebuje — jde potvrdit na jiný čas', async () => {
    const req = await newRequest('2026-10-01T07:00:00Z') // koliduje s termínem ze seedu
    const t = await tokenFor(req)
    expect(await applyActionLink(t)).toEqual({ ok: false, reason: 'overlap' })
    const res = await applyActionLink(t, { start: new Date('2026-11-05T10:00:00Z') })
    expect(res).toMatchObject({ ok: true, changed: true })
    const [m] = await messages('booking_changed')
    expect(m?.subject).toContain('Nový čas termínu')
  })
})

describe('nastavení a souhlas', () => {
  it('vypnutý typ se nezařadí', async () => {
    await db.query(
      `INSERT INTO ws.message_settings (account_id, business_id, type, enabled) VALUES ($1, $2, 'booking_confirmed', false)
       ON CONFLICT (business_id, type) DO UPDATE SET enabled = false`,
      [A.account, A.business],
    )
    await notifyBookingConfirmed(scopeA, A.business, A.appointment)
    await db.query(`UPDATE ws.appointments SET starts_at = now() + interval '2 days', ends_at = now() + interval '2 days 1 hour' WHERE id = $1`, [A.appointment])
    await notifyBookingConfirmed(scopeA, A.business, A.appointment)
    expect(await messages('booking_confirmed')).toHaveLength(0)
    await db.query(`DELETE FROM ws.message_settings WHERE type = 'booking_confirmed'`)
    await notifyBookingConfirmed(scopeA, A.business, A.appointment)
    expect(await messages('booking_confirmed')).toHaveLength(1)
  })

  it('upravený text v Nastavení jde do e-mailu', async () => {
    await db.query(
      `INSERT INTO ws.message_settings (account_id, business_id, type, enabled, subject) VALUES ($1, $2, 'request_received', true, 'Díky, {jmeno}')`,
      [A.account, A.business],
    )
    const req = await newRequest(null)
    await notifyNewRequest(scopeA, A.business, req)
    const [m] = await messages('request_received')
    expect(m.subject).toBe('Díky, Zákazník')
    await db.query(`DELETE FROM ws.message_settings WHERE type = 'request_received'`)
  })

  it('odhlášený zákazník hromadnou zprávu nedostane, ani když už byla ve frontě', async () => {
    const draft = await createDraft(ctxA, { id: A.business }, { customerId: A.customer, kind: 'thanks', subject: 'Díky', body: 'Text' })
    expect(await sendOutreachDraft(ctxA, { id: A.business }, draft!)).toBe('queued')
    const queued = await messages('outreach_thanks')
    expect(queued[0].status).toBe('queued')
    // Zákazník klikne na odhlášení v dřívějším e-mailu.
    const token = signLink({ kind: 'u', accountId: A.account, id: A.customer })
    expect(await unsubscribeCustomer(token)).not.toBeNull()
    await flushAccount(scopeA)
    expect(sent).toHaveLength(0)
    const [after] = await messages('outreach_thanks')
    expect(after.status).toBe('cancelled')
    // Nový koncept už neprojde vůbec.
    const another = await createDraft(ctxA, { id: A.business }, { customerId: A.customer, kind: 'thanks', subject: 'Díky', body: 'Text' })
    expect(another).toBeNull()
    await db.query(`UPDATE ws.customers SET unsubscribed_at = NULL WHERE id = $1`, [A.customer])
  })

  it('hromadná zpráva nese odkaz na odhlášení i hlavičku pro jeden klik', async () => {
    const draft = await createDraft(ctxA, { id: A.business }, { customerId: A.customer, kind: 'winback', subject: 'Dlouho jsme se neviděli', body: 'Text' })
    await sendOutreachDraft(ctxA, { id: A.business }, draft!)
    await flushAccount(scopeA)
    expect(sent).toHaveLength(1)
    expect(sent[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(sent[0].html).toContain('/z/odhlasit/u')
  })

  it('bez aktivního předplatného zákazník e-mail nedostane, majitel ano', async () => {
    await db.query(`UPDATE ws.subscriptions SET status = 'canceled' WHERE account_id = $1`, [A.account])
    const req = await newRequest(null)
    await notifyNewRequest(scopeA, A.business, req)
    expect(await messages('request_received')).toHaveLength(0)
    expect(await messages('new_request')).toHaveLength(1)
    await db.query(`UPDATE ws.subscriptions SET status = 'trialing' WHERE account_id = $1`, [A.account])
  })
})

describe('Zpět ruší čekající e-mail', () => {
  it('odmítnutí čeká a „Zpět“ ho zruší', async () => {
    const req = await newRequest('2026-11-10T09:00:00Z', 'declined')
    await notifyRequestDeclined(scopeA, A.business, req)
    const [m] = await messages('booking_declined')
    expect(m.status).toBe('queued')
    expect((await flushAccount(scopeA)).sent).toBe(0) // ještě není splatný
    await cancelPendingNotice(scopeA, `declined:${req}`)
    const [after] = await messages('booking_declined')
    expect(after.status).toBe('cancelled')
  })

  it('přesun a návrat na původní čas nepošle nic, druhý přesun jen přepíše čekající e-mail', async () => {
    const orig = new Date('2026-11-12T09:00:00Z')
    await db.query(`UPDATE ws.appointments SET starts_at = '2026-11-12T10:00:00Z', ends_at = '2026-11-12T11:00:00Z', status = 'confirmed' WHERE id = $1`, [A.appointment])
    await notifyAppointmentMoved(scopeA, A.business, A.appointment, orig)
    expect((await messages('booking_changed')).filter((m) => m.status === 'queued')).toHaveLength(1)
    await db.query(`UPDATE ws.appointments SET starts_at = '2026-11-12T12:00:00Z', ends_at = '2026-11-12T13:00:00Z' WHERE id = $1`, [A.appointment])
    await notifyAppointmentMoved(scopeA, A.business, A.appointment, new Date('2026-11-12T10:00:00Z'))
    expect((await messages('booking_changed')).filter((m) => m.status === 'queued')).toHaveLength(1)
    await db.query(`UPDATE ws.appointments SET starts_at = $2, ends_at = $3 WHERE id = $1`, [A.appointment, orig.toISOString(), '2026-11-12T10:00:00Z'])
    await notifyAppointmentMoved(scopeA, A.business, A.appointment, new Date('2026-11-12T12:00:00Z'))
    expect((await messages('booking_changed')).filter((m) => m.status === 'queued')).toHaveLength(0)
  })
})

describe('celá cesta', () => {
  it('poptávka → potvrzení z e-mailu → připomínka → poděkování', async () => {
    await db.query(
      `INSERT INTO ws.business_modules (account_id, business_id, module, enabled) VALUES ($1, $2, 'reminders', true), ($1, $2, 'loyalty', true)
       ON CONFLICT (business_id, module) DO UPDATE SET enabled = true`,
      [A.account, A.business],
    )
    const today = '2026-11-16'
    const start = '2026-11-17T09:00:00Z'
    const req = await newRequest(start)
    // 1. Poptávka: zákazník i majitel dostanou e-mail, majitel s tlačítky.
    await notifyNewRequest(scopeA, A.business, req)
    await flushAccount(scopeA)
    const owner = sent.find((m) => m.to === 'majitel@example.cz')!
    expect(sent.map((m) => m.subject)).toEqual(expect.arrayContaining(['Vaši poptávku jsme přijali', 'Nová poptávka: Zákazník']))
    const link = /\/z\/odkaz\/([A-Za-z0-9_.-]+)\?akce=potvrdit/.exec(owner.html)?.[1]
    expect(link).toBeTruthy()
    // 2. Majitel potvrdí z e-mailu bez přihlášení → zákazník dostane potvrzení s kalendářem.
    sent = []
    expect((await applyActionLink(link!)).ok).toBe(true)
    await flushAccount(scopeA)
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toContain('Termín je potvrzený')
    expect(sent[0].html).toContain('/z/kalendar/c')
    // 3. Den předem ráno připomínka (a jen jednou).
    sent = []
    const sender = (await loadSender(scopeA, A.business))!
    expect(await queueReminders(scopeA, sender, today)).toBe(1)
    expect(await queueReminders(scopeA, sender, today)).toBe(0)
    await flushAccount(scopeA)
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining('Připomínka')])
    // 4. Zaplaceno → poděkování se stavem karty.
    sent = []
    const [appt] = await rows<{ id: string }>(`SELECT id FROM ws.appointments WHERE request_id = $1`, [req])
    const paid = await completeVisit(ctxA, { id: A.business }, { appointmentId: appt.id, amount: 500, method: 'cash' })
    expect(paid.ok).toBe(true)
    await notifyVisitPaid(scopeA, A.business, appt.id, { rewardReady: false })
    await flushAccount(scopeA)
    expect(sent.map((m) => m.subject)).toEqual(['Děkujeme za návštěvu'])
    expect(sent[0].html).toContain('Věrnostní karta')
  })
})

describe('webhook Resendu', () => {
  it('pustí jen platný podpis Svix v časovém okně', () => {
    const secret = `whsec_${Buffer.from('tajne-tajne-tajne').toString('base64')}`
    const body = '{"type":"email.bounced"}'
    const ts = 1_800_000_000
    const sig = createHmac('sha256', Buffer.from('tajne-tajne-tajne')).update(`msg_1.${ts}.${body}`).digest('base64')
    const h = { id: 'msg_1', timestamp: String(ts), signature: `v1,${sig}` }
    expect(verifySvix(body, h, secret, ts)).toBe(true)
    expect(verifySvix(body + ' ', h, secret, ts)).toBe(false)
    expect(verifySvix(body, h, secret, ts + 600)).toBe(false)
    expect(verifySvix(body, h, undefined, ts)).toBe(false)
  })
})
