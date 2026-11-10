import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setWsDriverForTests, wsSystem, type WsDriver, type WsRow } from '../db'
import { setAdminAuthForTests } from '../admin/auth'
import { setAdminDriverForTests } from '../admin/db'
import { getClientDetail, listClients } from '../admin/clients'
import { hashAccountInviteCode, InviteConfigError, inviteClient, setInviteDeliveryForTests, type InviteDelivery } from '../admin/invite'
import { generateWebKeys } from '../admin/web-keys'
import { deleteNewsDraft, newsRecipients, parseNewsImage, publishNews, saveNews, sendNewsEmail, unpublishNews } from '../admin/news'
import { resolveSecretKey } from '../keys'
import { getNews } from '../email/inbox'
import { queueNewsForAccount } from '../email/scheduled'
import { renderNewsEmail } from '../email/news-email'
import { setLinkSecretForTests } from '../email/links'
import { setEmailTransportForTests } from '../email/transport'
import { newsTextHints, sniffImageType } from '../news-format'
import { asApp, createWsTestDb, ids, pgCode, pgliteDriver } from './helpers/ws-pglite'
import { GET as newsImage } from '../../../app/z/novinky/[id]/obrazek/route'
import { inviteClientAction, generateWebKeysAction, resendInviteAction } from '../../../app/dashboard/klienti/actions'
import { saveNewsAction, publishNewsAction, sendNewsEmailAction, deleteNewsAction, newsRecipientsAction } from '../../../app/dashboard/novinky/actions'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))

// Admin konzole S17: přehled klientů, pozvání, klíče webu, poznámka, novinky.
// Admin čte ws jako vlastník tabulek (PGlite superuser = vlastník v Supabase),
// zápisy do dat klienta jdou rolí ws_app pod RLS. Bez přihlášeného admina nic.

let db: PGlite
const A = ids('a')
const B = ids('b')
const admin = { email: 'admin@example.cz' }

const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

/** Vlastník tabulek bez SET ROLE — jako DATABASE_URL v adminu. */
function ownerDriver(pg: PGlite): WsDriver {
  return {
    transaction: (queries) =>
      pg.transaction(async (tx) => {
        const out: WsRow[][] = []
        for (const x of queries) out.push((await tx.query<WsRow>(x.text, [...x.params])).rows)
        return out
      }),
  }
}

/** Odeslané pozvánky (nic neodchází ven). */
const sent: { email: string; businessName: string; nextPath: string }[] = []
const fakeDelivery = (ok = true): InviteDelivery => ({
  async sendInvite(input) {
    sent.push(input)
    return ok
  },
})

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
  setAdminDriverForTests(ownerDriver(db))
  setLinkSecretForTests('test-pepper-'.repeat(4))
  setEmailTransportForTests(null)
  process.env.WS_KEY_PEPPER = 'p'.repeat(40)
  await db.query(`UPDATE ws.members SET email = 'majitel-' || account_id::text || '@example.cz'`)
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  setAdminDriverForTests(null)
  setAdminAuthForTests(null)
  setInviteDeliveryForTests(null)
  setLinkSecretForTests(null)
  setEmailTransportForTests(undefined)
  await db?.close()
})

beforeEach(() => {
  sent.length = 0
  setAdminAuthForTests(async () => admin)
  setInviteDeliveryForTests(fakeDelivery())
})

describe('bez admina nic', () => {
  it('každá akce adminu bez přihlášeného admina odmítne a nic nezapíše', async () => {
    setAdminAuthForTests(async () => null)
    const before = await rows<{ n: number }>(`SELECT (SELECT count(*) FROM ws.accounts) + (SELECT count(*) FROM ws.product_news) + (SELECT count(*) FROM ws.audit_log) AS n`)
    const results = await Promise.all([
      inviteClientAction({ email: 'novy@example.cz', businessName: 'Nový klient', industry: 'zamecnictvi' }),
      resendInviteAction({ accountId: A.account, email: 'x@example.cz' }),
      generateWebKeysAction({ accountId: A.account, businessId: A.business }),
      saveNewsAction({ id: null, title: 'X', body: 'Y', link: '', tag: 'new', image: { action: 'keep' } }),
      publishNewsAction({ id: A.account }),
      deleteNewsAction({ id: A.account }),
      newsRecipientsAction(),
      sendNewsEmailAction({ id: A.account, confirmedPeople: 1 }),
    ])
    for (const r of results) expect(r).toEqual({ ok: false, error: expect.stringContaining('Přihlášení vypršelo') })
    const after = await rows<{ n: number }>(`SELECT (SELECT count(*) FROM ws.accounts) + (SELECT count(*) FROM ws.product_news) + (SELECT count(*) FROM ws.audit_log) AS n`)
    expect(after).toEqual(before)
    expect(sent).toEqual([])
  })
})

describe('přehled klientů', () => {
  it('ukáže oba účty se stavem, poptávkami za 30 dní a napojením webu', async () => {
    const list = await listClients()
    const a = list.find((c) => c.id === A.account)
    expect(a).toMatchObject({ name: 'Firma a', businesses: 1, access: 'trialing', requests30d: 1, web: 'ready', members: 1 })
    expect(a?.lastActivity).toBeInstanceOf(Date)
    expect(list.some((c) => c.id === B.account)).toBe(true)
  })

  it('zkušební poptávky a staré poptávky se nepočítají, použitý web je „ano“', async () => {
    await db.query(`INSERT INTO ws.requests (account_id, business_id, source, is_test) VALUES ($1, $2, 'web', true)`, [B.account, B.business])
    await db.query(`INSERT INTO ws.requests (account_id, business_id, source, created_at) VALUES ($1, $2, 'web', now() - interval '40 days')`, [B.account, B.business])
    await db.query(`UPDATE ws.web_integrations SET last_used_at = now() WHERE account_id = $1`, [B.account])
    const b = (await listClients()).find((c) => c.id === B.account)
    expect(b).toMatchObject({ requests30d: 1, web: 'used' })
  })

  it('detail má jen data svého účtu, neplatné ID = null', async () => {
    const detail = await getClientDetail(A.account)
    expect(detail?.businessesList.map((b) => b.id)).toEqual([A.business])
    expect(detail?.membersList).toHaveLength(1)
    expect(JSON.stringify(detail)).not.toContain(B.account)
    expect(await getClientDetail('neni-uuid')).toBeNull()
    expect(await getClientDetail('00000000-0000-4000-8000-000000000000')).toBeNull()
  })
})

describe('pozvat klienta', () => {
  const codeOf = (nextPath: string) => nextPath.split('/').pop() ?? ''

  it('založí účet s byznysem ze šablony bez člena, pošle pozvánku s jednorázovým kódem a zapíše audit', async () => {
    const res = await inviteClient(admin, { email: 'klient@example.cz', businessName: 'Zámečnictví Pozvánka', industry: 'zamecnictvi' })
    expect(res.status).toBe('invited')
    const accountId = res.accountId
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ email: 'klient@example.cz', businessName: 'Zámečnictví Pozvánka' })
    expect(sent[0].nextPath).toMatch(/^\/w\/pozvanka\/zw_[A-Za-z0-9]{32}$/)

    const [biz] = await rows<{ industry: string; stages: number; fields: number }>(
      `SELECT b.industry, (SELECT count(*)::int FROM ws.stages s WHERE s.business_id = b.id) AS stages,
              (SELECT count(*)::int FROM ws.field_definitions f WHERE f.business_id = b.id) AS fields
       FROM ws.businesses b WHERE b.account_id = $1`,
      [accountId],
    )
    expect(biz.industry).toBe('zamecnictvi')
    expect(biz.stages).toBeGreaterThan(0)
    expect(biz.fields).toBeGreaterThan(0)
    expect(await rows(`SELECT 1 FROM ws.members WHERE account_id = $1`, [accountId])).toHaveLength(0)

    // V DB jen hash kódu, nikdy kód sám.
    const code = codeOf(sent[0].nextPath)
    const invites = await rows<{ code_hash: string; role: string }>(`SELECT code_hash, role FROM ws.account_invites WHERE account_id = $1`, [accountId])
    expect(invites).toEqual([{ code_hash: hashAccountInviteCode(code), role: 'owner' }])
    expect(JSON.stringify(invites)).not.toContain(code)

    const audit = await rows<{ actor: string; action: string; details: Record<string, unknown> }>(
      `SELECT actor, action, details FROM ws.audit_log WHERE account_id = $1 ORDER BY created_at, action`,
      [accountId],
    )
    expect(audit.map((a) => a.action).sort()).toEqual(['admin.account_created', 'admin.invite_sent'])
    expect(audit.every((a) => a.actor === 'admin')).toBe(true)
    expect(JSON.stringify(audit)).not.toContain('admin@example.cz')
    expect(JSON.stringify(audit)).not.toContain('klient@example.cz')

    // Klient pozvánku uplatní: zapíše se jako vlastník, jen jednou.
    const redeem = async (user: string) =>
      (await wsSystem<{ a: string | null }>`SELECT ws.redeem_account_invite(${hashAccountInviteCode(code)}, ${user}, ${'klient@example.cz'}, ${'Jan Pozvaný'}) AS a`)[0].a
    expect(await redeem('user_pozvany')).toBe(accountId)
    expect(await redeem('user_jiny')).toBeNull()
    expect(await rows(`SELECT role, name FROM ws.members WHERE account_id = $1`, [accountId])).toEqual([{ role: 'owner', name: 'Jan Pozvaný' }])
  })

  it('když pozvánka neodejde, účet zůstane a nová pozvánka zruší starou', async () => {
    setInviteDeliveryForTests(fakeDelivery(false))
    const res = await inviteClient(admin, { email: 'druhy@example.cz', businessName: 'Úklid Druhý', industry: 'uklid' })
    expect(res.status).toBe('invite_failed')
    expect(await rows(`SELECT 1 FROM ws.accounts WHERE id = $1`, [res.accountId])).toHaveLength(1)

    setInviteDeliveryForTests(fakeDelivery())
    expect((await resendInviteAction({ accountId: res.accountId, email: 'druhy@example.cz' })).ok).toBe(true)
    const active = await rows(`SELECT 1 FROM ws.account_invites WHERE account_id = $1 AND revoked_at IS NULL AND used_at IS NULL`, [res.accountId])
    expect(active).toHaveLength(1)
  })

  it('bez WS_KEY_PEPPER nic nevznikne', async () => {
    const pepper = process.env.WS_KEY_PEPPER
    delete process.env.WS_KEY_PEPPER
    const [{ n: before }] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM ws.accounts`)
    try {
      await expect(inviteClient(admin, { email: 'x@example.cz', businessName: 'Nic', industry: 'uklid' })).rejects.toBeInstanceOf(InviteConfigError)
    } finally {
      process.env.WS_KEY_PEPPER = pepper
    }
    const [{ n: after }] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM ws.accounts`)
    expect(after).toBe(before)
    expect(sent).toEqual([])
  })

  it('akce ověří vstup (e-mail, obor)', async () => {
    expect((await inviteClientAction({ email: 'neni-email', businessName: 'Firma', industry: 'uklid' })).ok).toBe(false)
    expect((await inviteClientAction({ email: 'a@example.cz', businessName: 'Firma', industry: 'kosmonautika' })).ok).toBe(false)
    expect(sent).toEqual([])
  })
})

describe('klíče a prompt pro web', () => {
  it('vytvoří tajný klíč, který patří účtu, prompt a audit; cizí byznys odmítne', async () => {
    const keys = await generateWebKeys(admin, { accountId: A.account, id: A.business, slug: 'byznys-a' })
    expect(keys.secretKey).toMatch(/^sk_live_/)
    expect(keys.prompt).toContain('Byznys a')
    expect(keys.prompt).not.toContain(keys.secretKey)
    expect(keys.widgetCode).toContain('/embed/byznys-a.js')
    const resolved = await resolveSecretKey(keys.secretKey)
    expect(resolved).toMatchObject({ accountId: A.account, businessId: A.business })
    expect(await rows(`SELECT 1 FROM ws.audit_log WHERE account_id = $1 AND action = 'admin.web_keys_generated'`, [A.account])).toHaveLength(1)

    const foreign = await generateWebKeysAction({ accountId: A.account, businessId: B.business })
    expect(foreign).toEqual({ ok: false, error: 'Tenhle byznys neexistuje.' })
  })
})

describe('soukromí účtu v administraci', () => {
  it('detail klienta nezobrazuje interní poznámky; klient (ws_app) je nepřečte', async () => {
    await db.query(`INSERT INTO ws.account_admin_notes (account_id, note, updated_by) VALUES ($1, $2, $3)`, [A.account, 'Soukromá poznámka', admin.email])
    expect(await getClientDetail(A.account)).not.toHaveProperty('note')
    expect(await pgCode(asApp(db, A.account, (tx) => tx.query(`SELECT * FROM ws.account_admin_notes`)))).toBe('42501')
  })
})

describe('novinky', () => {
  it('validuje text, odkaz a obrázek (jen PNG/JPEG/WebP podle obsahu)', async () => {
    await expect(saveNews(admin, null, { title: ' ', body: 'x', link: '', tag: 'new', image: { action: 'keep' } })).rejects.toThrow('nadpis')
    await expect(saveNews(admin, null, { title: 'X', body: 'Y', link: 'http://example.cz', tag: 'new', image: { action: 'keep' } })).rejects.toThrow('https')
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')
    await expect(saveNews(admin, null, { title: 'X', body: 'Y', link: '', tag: 'new', image: { action: 'set', base64: svg } })).rejects.toThrow('PNG')
    expect(() => parseNewsImage(Buffer.alloc(700 * 1024, 0xff).toString('base64'))).toThrow('600 kB')
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull()
  })

  it('koncept → zveřejnit → zvonek klienta ukáže štítek a obrázek; obrázek jen u zveřejněné', async () => {
    const id = await saveNews(admin, null, {
      title: 'Faktury z telefonu',
      body: 'Fakturu teď vystavíte i z mobilu.',
      link: 'https://www.zakaziq.cz/novinky',
      tag: 'improvement',
      image: { action: 'set', base64: PNG.toString('base64') },
    })
    const ctxA = { accountId: A.account, userId: 'user_a', role: 'owner' as const }
    expect((await getNews(ctxA)).items.find((n) => n.id === id)).toBeUndefined()
    expect((await newsImage(new Request('http://x'), { params: Promise.resolve({ id }) })).status).toBe(404)

    expect(await publishNews(id)).toBe(true)
    const item = (await getNews(ctxA)).items.find((n) => n.id === id)
    expect(item).toMatchObject({ tag: 'improvement', image: `/z/novinky/${id}/obrazek`, link: 'https://www.zakaziq.cz/novinky' })
    const img = await newsImage(new Request('http://x'), { params: Promise.resolve({ id }) })
    expect(img.status).toBe(200)
    expect(img.headers.get('Content-Type')).toBe('image/png')
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true)

    expect(await unpublishNews(id)).toBe(true)
    expect(await deleteNewsDraft(id)).toBe(true)
  })

  it('e-mailem jen po potvrzení počtu, jednou, jen kdo novinky nevypnul', async () => {
    await db.query(`DELETE FROM ws.outbound_messages WHERE type = 'product_news'`)
    await db.query(`UPDATE ws.accounts SET news_emails = false WHERE id = $1`, [B.account])
    const id = await saveNews(admin, null, { title: 'Nový kalendář', body: 'Kalendář je rychlejší.', link: '', tag: 'new', image: { action: 'keep' } })

    expect(await sendNewsEmail(admin, id, 1)).toEqual({ status: 'not_published' })
    await publishNews(id)

    // Před odesláním denní cron nic neposílá — e-mail až po „Poslat e-mailem všem“.
    expect(await queueNewsForAccount({ accountId: A.account })).toBe(0)

    const recipients = await newsRecipients()
    const wrong = await sendNewsEmail(admin, id, recipients.people + 1)
    expect(wrong).toEqual({ status: 'recipients_changed', recipients })

    const res = await sendNewsEmail(admin, id, recipients.people)
    expect(res).toMatchObject({ status: 'sent', recipients: recipients.people })
    const msgs = await rows<{ account_id: string; subject: string; status: string }>(
      `SELECT account_id, subject, status FROM ws.outbound_messages WHERE type = 'product_news'`,
    )
    expect(msgs.some((m) => m.account_id === A.account && m.subject === 'Nové v ZakazIQ: Nový kalendář')).toBe(true)
    expect(msgs.some((m) => m.account_id === B.account)).toBe(false)
    // Bez WS_EMAIL_FROM čekají ve frontě.
    expect(msgs.every((m) => m.status === 'queued')).toBe(true)

    expect(await sendNewsEmail(admin, id, recipients.people)).toEqual({ status: 'already_sent' })
    // Denní cron ho zařadí znovu — klíč události nic nezdvojí.
    await queueNewsForAccount({ accountId: A.account })
    const after = await rows(`SELECT 1 FROM ws.outbound_messages WHERE type = 'product_news' AND account_id = $1`, [A.account])
    expect(after).toHaveLength(msgs.filter((m) => m.account_id === A.account).length)
    // Odeslanou novinku už nejde skrýt ani smazat.
    expect(await unpublishNews(id)).toBe(false)
    expect(await deleteNewsDraft(id)).toBe(false)
    await db.query(`UPDATE ws.accounts SET news_emails = true WHERE id = $1`, [B.account])
  })

  it('účet založený po odeslání novinku e-mailem nedostane', async () => {
    // Hodiny PGlite mezi transakcemi neběží spolehlivě — odeslání posuneme do minulosti.
    await db.query(`UPDATE ws.product_news SET emailed_at = now() - interval '1 hour' WHERE emailed_at IS NOT NULL`)
    const res = await inviteClient(admin, { email: 'pozdni@example.cz', businessName: 'Pozdní Klient', industry: 'uklid' })
    await db.query(`INSERT INTO ws.members (account_id, user_id, role, email) VALUES ($1, 'user_pozdni', 'owner', 'pozdni@example.cz')`, [res.accountId])
    expect(await queueNewsForAccount({ accountId: res.accountId })).toBe(0)
  })
})

describe('e-mail a texty novinky', () => {
  it('e-mail má štítek, nadpis, obrázek, odkaz a odhlášení; vstup je escapovaný', () => {
    const html = renderNewsEmail(
      { title: 'Nové <b>věci</b>', body: 'Text', tag: 'fix', link: 'https://www.zakaziq.cz/x', imageUrl: 'https://www.zakaziq.cz/z/novinky/1/obrazek' },
      'https://www.zakaziq.cz/z/odhlasit/n1',
    )
    expect(html.subject).toBe('Oprava v ZakazIQ: Nové <b>věci</b>')
    expect(html.html).toContain('Nové &lt;b&gt;věci&lt;/b&gt;')
    expect(html.html).toContain('<img src="https://www.zakaziq.cz/z/novinky/1/obrazek"')
    expect(html.html).toContain('Nechci dostávat tyhle zprávy')
    const noImage = renderNewsEmail({ title: 'X', body: 'Y', tag: 'new', link: null, imageUrl: 'javascript:alert(1)' }, null)
    expect(noImage.html).not.toContain('<img')
  })

  it('„Učesat text“ najde pomlčky a strojové fráze, čistý text nechá být', () => {
    const ids = newsTextHints('Novinka.', 'S radostí oznamujeme, že je to klíčová změna — nicméně stačí kliknout.').map((h) => h.id)
    expect(ids).toEqual(expect.arrayContaining(['dash', 'title-dot']))
    expect(ids.filter((i) => i.startsWith('phrase-')).length).toBeGreaterThanOrEqual(3)
    expect(newsTextHints('Faktury z telefonu', 'Fakturu teď vystavíte i z mobilu. Stačí otevřít Peníze.')).toEqual([])
  })
})
