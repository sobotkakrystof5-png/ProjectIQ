import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Navrhovač nabídek R-160: nová nabídka pro firmu (web, IČO nebo název),
 * ukázka webu od Growth OS (žádost, zpětné hlášení, ukázka od robota,
 * vypršení) a e-mail s ukázkou. Proti Postgresu s migracemi 136, 137, 142
 * a 145. Nic se neposílá ven: Growth OS i ARES jsou podstrčené.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

const notifications = vi.hoisted(() => [] as { type: string; title: string; link?: string }[])
const ares = vi.hoisted(() => ({ result: { status: 'ok', subject: { ico: '27700160', name: 'Realitní kancelář Dvořák, s.r.o.', address: 'Třebíč', dic: '' } } as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/lib/api-rate-limit', () => ({ isApiRateLimited: async () => false, recordApiRequest: async () => {} }))
vi.mock('@/lib/notifications', () => ({
  createNotification: async (n: { type: string; title: string; link?: string }) => {
    notifications.push(n)
  },
}))
vi.mock('@/lib/ares', async (orig) => ({
  ...(await orig<typeof import('@/lib/ares')>()),
  lookupIco: async () => ares.result,
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import {
  DEMO_TIMEOUT_MINUTES,
  demoUrlOk,
  loadDemo,
  maintainOfferDemos,
  markDemoSent,
  recordDemoResult,
  requestDemo,
  type DemoLead,
} from '@/lib/admin/offers/demo'
import { normalizeWeb, parseFirmInput, startOfferForFirm } from '@/lib/admin/offers/new-firm'
import { buildProposalMail } from '@/lib/admin/lead-mail-templates'
import { POST as demoResultRoute } from '@/app/api/public/nabidky/ukazka/route'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO admin_settings (id) VALUES (true);
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, company text, email text, phone text,
  ico text, merged_into uuid REFERENCES contacts(id), source text NOT NULL DEFAULT 'manual',
  last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contacts_email_live ON contacts (lower(email)) WHERE merged_into IS NULL AND email IS NOT NULL;
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL, price numeric
);
CREATE TABLE outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_updated_at timestamptz NOT NULL DEFAULT now(),
  company_name text NOT NULL, website text, industry text, city text, research jsonb,
  demo_url text, demo_built_at timestamptz,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
);
`

const MIGRATIONS = ['136_navrhovac_rozbor.sql', '137_navrhovac_fronta.sql', '142_navrhovac_nabidky.sql', '145_navrhovac_ukazka.sql']
const migration = (name: string) => fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8')

const KEY = 'k'.repeat(40)

async function contact(name: string, email: string | null = null): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO contacts (display_name, company, email) VALUES ($1, $1, $2) RETURNING id::text`,
    [name, email],
  )
  return res.rows[0].id
}

async function proposal(contactId: string, company = 'Truhlářství Novák'): Promise<string> {
  const research = await db.query<{ id: string }>(
    `INSERT INTO offer_research (contact_id, status, brief, result)
     VALUES ($1, 'done', $2::jsonb, $3::jsonb) RETURNING id::text`,
    [
      contactId,
      JSON.stringify({ company, web: 'https://truhlar-novak.cz/', city: 'Kolín', industry: 'truhlářství', prior: [] }),
      JSON.stringify({ company: { summary: 'Truhlářství v Kolíně, kuchyně na míru.' } }),
    ],
  )
  const res = await db.query<{ id: string }>(
    `INSERT INTO offer_proposals (contact_id, research_id, company, inputs, value, variants)
     VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb) RETURNING id::text`,
    [contactId, research.rows[0].id, company],
  )
  return res.rows[0].id
}

function resultRequest(body: unknown, opts: { key?: string | null; origin?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.key !== null) headers.authorization = `Bearer ${opts.key ?? KEY}`
  if (opts.origin) headers.origin = opts.origin
  return new NextRequest('https://www.zakaziq.cz/api/public/nabidky/ukazka', { method: 'POST', headers, body: JSON.stringify(body) })
}

describe('odkaz na ukázku a vstup formuláře (bez databáze)', () => {
  it('ukázka jen z navrhy.vizeon.cz', () => {
    expect(demoUrlOk('https://navrhy.vizeon.cz/reality-dvorak/')).toBe('https://navrhy.vizeon.cz/reality-dvorak/')
    expect(demoUrlOk('https://navrhy.vizeon.cz/reality-dvorak')).toBe('https://navrhy.vizeon.cz/reality-dvorak')
    expect(demoUrlOk('http://navrhy.vizeon.cz/reality-dvorak/')).toBeNull()
    expect(demoUrlOk('https://navrhy.vizeon.cz.evil.cz/x/')).toBeNull()
    expect(demoUrlOk('https://evil.cz/navrhy.vizeon.cz/x/')).toBeNull()
    expect(demoUrlOk('https://navrhy.vizeon.cz/a/b/')).toBeNull()
    expect(demoUrlOk('javascript:alert(1)')).toBeNull()
  })

  it('web jak ho člověk napíše, IČO s kontrolní číslicí, aspoň jedno pole', () => {
    expect(normalizeWeb('firma.cz')).toBe('https://firma.cz/')
    expect(normalizeWeb('www.firma.cz/sluzby')).toBe('https://www.firma.cz/sluzby')
    expect(normalizeWeb('ne web')).toBeNull()
    expect(parseFirmInput({})).toEqual({ ok: false, error: 'Zadejte web, IČO nebo název firmy.' })
    expect(parseFirmInput({ ico: '12345678' })).toMatchObject({ ok: false })
    expect(parseFirmInput({ ico: '277 001 60' })).toMatchObject({ ok: true, fields: { ico: '27700160' } })
    expect(parseFirmInput({ web: 'trebic-reality.cz', email: 'není e-mail' })).toMatchObject({ ok: false })
  })

  it('e-mail: jen nabídka, jen ukázka, obojí; odkazy na konci řádku bez tečky', () => {
    const offerOnly = buildProposalMail({ company: 'Kovarson', offerUrl: 'https://www.zakaziq.cz/nabidka/abc', price: '33 000 Kč', demoUrl: null })
    expect(offerOnly.subject).toMatch(/Nabídka/)
    expect(offerOnly.body).toContain('https://www.zakaziq.cz/nabidka/abc')

    const demoOnly = buildProposalMail({ company: 'Kovarson', offerUrl: null, price: null, demoUrl: 'https://navrhy.vizeon.cz/kovarson-s-r-o/' })
    expect(demoOnly.subject).toBe('Návrh nového webu pro Kovarson')
    expect(demoOnly.body).toContain('https://navrhy.vizeon.cz/kovarson-s-r-o/\n')
    expect(demoOnly.body).not.toContain('nabidka/')
    expect(demoOnly.body).not.toMatch(/Kč/)

    const both = buildProposalMail({
      company: 'Kovarson',
      offerUrl: 'https://www.zakaziq.cz/nabidka/abc',
      price: '33 000 Kč',
      demoUrl: 'https://navrhy.vizeon.cz/kovarson-s-r-o/',
    })
    expect(both.body).toContain('https://navrhy.vizeon.cz/kovarson-s-r-o/\n')
    expect(both.body).toContain('https://www.zakaziq.cz/nabidka/abc\n')
    expect(both.body).toContain('Doporučuji variantu za 33 000 Kč.')
    expect(both.body).not.toMatch(/https:\S+\.\s/)
  })
})

describe('ukázka a nová nabídka nad databází (migrace 136, 137, 142, 145)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    for (const name of MIGRATIONS) await db.exec(migration(name))
    for (const name of MIGRATIONS) await db.exec(migration(name)) // idempotence
    setAdminDbForTests(pgliteAdminDriver(db))
    process.env.GROWTH_OS_DEMO_URL = 'https://navrhy.vizeon.cz/api/zakaziq-demo'
    process.env.GROWTH_OS_DEMO_KEY = 'd'.repeat(40)
    process.env.GROWTH_OS_API_KEY = KEY
    process.env.OFFER_RESEARCH_API_KEY = 'r'.repeat(40)
  })
  afterAll(async () => {
    setAdminDbForTests(null)
    delete process.env.GROWTH_OS_DEMO_URL
    delete process.env.GROWTH_OS_DEMO_KEY
    delete process.env.GROWTH_OS_API_KEY
    delete process.env.OFFER_RESEARCH_API_KEY
    await db.close()
  })
  beforeEach(() => {
    notifications.length = 0
  })

  it('žádost o ukázku: do Growth OS jen veřejné údaje, druhá žádost se nepošle, hotová ukázka zazvoní', async () => {
    const c = await contact('Truhlářství Novák', 'info@truhlar-novak.cz')
    const id = await proposal(c)
    const sent: { lead: DemoLead; proposalId: string }[] = []
    const dispatch = async (lead: DemoLead, proposalId: string) => {
      sent.push({ lead, proposalId })
      return true
    }

    expect(await requestDemo(id, dispatch)).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    expect(sent[0].proposalId).toBe(id)
    expect(sent[0].lead).toEqual({
      company_name: 'Truhlářství Novák',
      email: 'info@truhlar-novak.cz',
      website: 'https://truhlar-novak.cz/',
      city: 'Kolín',
      industry: 'truhlářství',
      phone: null,
      notes: 'Truhlářství v Kolíně, kuchyně na míru.',
    })
    expect((await loadDemo(id, c)).demo).toMatchObject({ status: 'requested', source: 'build' })
    expect(await requestDemo(id, dispatch)).toEqual({ ok: false, error: 'already' })
    expect(sent).toHaveLength(1)

    // Hlášení od Growth OS přes vstup: bez klíče, z prohlížeče a s cizí adresou ne.
    expect((await demoResultRoute(resultRequest({ proposal_id: id, status: 'ready', url: 'https://navrhy.vizeon.cz/novak/' }, { key: null }))).status).toBe(401)
    expect(
      (await demoResultRoute(resultRequest({ proposal_id: id, status: 'ready', url: 'https://navrhy.vizeon.cz/novak/' }, { origin: 'https://evil.cz' }))).status,
    ).toBe(403)
    expect((await demoResultRoute(resultRequest({ proposal_id: id, status: 'ready', url: 'https://evil.cz/novak/' }))).status).toBe(400)

    const ok = await demoResultRoute(resultRequest({ proposal_id: id, status: 'ready', url: 'https://navrhy.vizeon.cz/novak/', slug: 'novak' }))
    expect(ok.status).toBe(200)
    expect((await loadDemo(id, c)).demo).toMatchObject({ status: 'ready', url: 'https://navrhy.vizeon.cz/novak/' })
    expect(notifications).toEqual([expect.objectContaining({ type: 'offer_demo', link: `/dashboard/kontakty/${c}` })])

    // Stejné hlášení znovu nic nezmění a nezazvoní podruhé.
    expect((await demoResultRoute(resultRequest({ proposal_id: id, status: 'ready', url: 'https://navrhy.vizeon.cz/novak/' }))).status).toBe(200)
    expect(notifications).toHaveLength(1)
  })

  it('výsledek k nabídce, ke které ZakazIQ ukázku nevyžádal, se odmítne', async () => {
    const c = await contact('Cizí firma', 'cizi@firma.cz')
    const id = await proposal(c, 'Cizí firma')
    const res = await demoResultRoute(resultRequest({ proposal_id: id, status: 'ready', url: 'https://navrhy.vizeon.cz/cizi/' }))
    expect(res.status).toBe(404)
    expect((await loadDemo(id, c)).demo).toBeNull()
  })

  it('kontakt bez e-mailu ukázku nedostane, Growth OS se nevolá', async () => {
    const c = await contact('Bez e-mailu')
    const id = await proposal(c, 'Bez e-mailu')
    let called = false
    expect(await requestDemo(id, async () => ((called = true), true))).toEqual({ ok: false, error: 'no_email' })
    expect(called).toBe(false)
  })

  it('nepovedené odeslání žádosti se zapíše a jde zkusit znovu', async () => {
    const c = await contact('Elektro Pokus', 'info@elektro-pokus.cz')
    const id = await proposal(c, 'Elektro Pokus')
    expect(await requestDemo(id, async () => false)).toEqual({ ok: false, error: 'dispatch_failed' })
    expect((await loadDemo(id, c)).demo).toMatchObject({ status: 'failed', error: 'dispatch_failed' })
    expect(await requestDemo(id, async () => true)).toEqual({ ok: true })
  })

  it('ukázka od robota je hotová hned a po odeslání se zapíše', async () => {
    const c = await contact('Reality Dvořák', 'info@rkdvorak.cz')
    await db.query(
      `INSERT INTO outreach_leads (company_name, website, demo_url, demo_built_at, contact_id) VALUES ('Reality Dvořák', 'https://trebic-reality.cz/', $1, now(), $2)`,
      ['https://navrhy.vizeon.cz/reality-dvorak/', c],
    )
    const id = await proposal(c, 'Reality Dvořák')
    expect((await loadDemo(id, c)).demo).toMatchObject({ status: 'ready', source: 'robot', url: 'https://navrhy.vizeon.cz/reality-dvorak/', sentAt: null })
    await markDemoSent(id, 'https://navrhy.vizeon.cz/reality-dvorak/')
    const after = (await loadDemo(id, c)).demo
    expect(after).toMatchObject({ status: 'ready', source: 'robot' })
    expect(after?.sentAt).not.toBeNull()
    // Robotí ukázku Growth OS „hlášením" přepsat nemůže.
    expect((await demoResultRoute(resultRequest({ proposal_id: id, status: 'failed' }))).status).toBe(404)
  })

  it('žádost bez odpovědi vyprší a pozdní hotová ukázka se ještě zapíše', async () => {
    const c = await contact('Pomalý web', 'info@pomaly.cz')
    const id = await proposal(c, 'Pomalý web')
    expect(await requestDemo(id, async () => true)).toEqual({ ok: true })
    await db.query(`UPDATE offer_demos SET requested_at = now() - interval '1 minute' * $2 WHERE proposal_id = $1`, [id, DEMO_TIMEOUT_MINUTES + 5])
    expect(await maintainOfferDemos()).toBe(1)
    expect((await loadDemo(id, c)).demo).toMatchObject({ status: 'failed', error: 'timeout' })
    expect(await recordDemoResult({ proposalId: id, status: 'ready', url: 'https://navrhy.vizeon.cz/pomaly-web/' })).toBe(true)
    expect((await loadDemo(id, c)).demo).toMatchObject({ status: 'ready' })
  })

  it('smazání nabídky smaže i ukázku', async () => {
    const c = await contact('Na smazání', 'info@smazat.cz')
    const id = await proposal(c, 'Na smazání')
    await requestDemo(id, async () => true)
    await db.query(`DELETE FROM offer_proposals WHERE id = $1`, [id])
    const left = await db.query(`SELECT 1 FROM offer_demos WHERE proposal_id = $1`, [id])
    expect(left.rows).toHaveLength(0)
  })

  it('nová nabídka: firma jen s IČO dostane jméno z rejstříku, kontakt a rozbor ve frontě', async () => {
    const out = await startOfferForFirm({ ico: '27700160', web: 'realitka-pokus.cz' })
    expect(out).toMatchObject({ ok: true, created: true, research: { ok: true, fired: false } })
    if (!out.ok) return
    const row = await db.query<{ display_name: string; ico: string; source: string }>(
      `SELECT display_name, ico, source FROM contacts WHERE id = $1`,
      [out.contactId],
    )
    expect(row.rows[0]).toEqual({ display_name: 'Realitní kancelář Dvořák, s.r.o.', ico: '27700160', source: 'nabidka' })
    const research = await db.query<{ status: string; brief: { web: string } }>(
      `SELECT status, brief FROM offer_research WHERE contact_id = $1`,
      [out.contactId],
    )
    expect(research.rows[0]).toMatchObject({ status: 'queued', brief: { web: 'https://realitka-pokus.cz/' } })

    // Stejná firma podruhé: kontakt se nezaloží znovu, rozbor už běží.
    const again = await startOfferForFirm({ ico: '27700160' })
    expect(again).toMatchObject({ ok: true, created: false, contactId: out.contactId, research: { ok: false, error: 'already_running' } })
  })

  it('nová nabídka najde firmu od robota podle webu, ne podle názvu', async () => {
    const c = await contact('Kovarson s.r.o.', 'info@kovarson.cz')
    await db.query(`INSERT INTO outreach_leads (company_name, website, contact_id) VALUES ('Kovarson s.r.o.', 'http://kovarson.cz/', $1)`, [c])
    const out = await startOfferForFirm({ web: 'www.kovarson.cz' })
    expect(out).toMatchObject({ ok: true, created: false, contactId: c })
  })

  it('jen web: kontakt se jmenuje podle domény, rejstřík s neznámým IČO firmu nezaloží', async () => {
    const out = await startOfferForFirm({ web: 'https://www.tesarske-prace.cz/' })
    expect(out).toMatchObject({ ok: true, created: true })
    if (out.ok) {
      const row = await db.query<{ display_name: string }>(`SELECT display_name FROM contacts WHERE id = $1`, [out.contactId])
      expect(row.rows[0].display_name).toBe('tesarske-prace.cz')
    }
    ares.result = { status: 'not_found' }
    expect(await startOfferForFirm({ ico: '25596641' })).toEqual({ ok: false, error: 'Firmu s tímhle IČO rejstřík nezná. Zkontrolujte ho prosím.' })
  })
})
