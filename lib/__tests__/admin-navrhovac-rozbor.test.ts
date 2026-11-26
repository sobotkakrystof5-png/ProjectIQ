import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Navrhovač nabídek, krok N1: rozbor firmy (R-147, běh podle R-148).
 * Kontrola výsledku (B10: tvrzení bez zdroje se zahodí), spuštění cloudové
 * úlohy Claude Code, fronta, oba veřejné vstupy pro úlohu a údržba — proti
 * skutečnému Postgresu s migracemi 136 a 137. Anthropic se nevolá.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

const notifications = vi.hoisted(() => [] as { type: string; title: string; link?: string }[])

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/lib/api-rate-limit', () => ({ isApiRateLimited: async () => false, recordApiRequest: async () => {} }))
vi.mock('@/lib/notifications', () => ({
  createNotification: async (n: { type: string; title: string; link?: string }) => {
    notifications.push(n)
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { normalizeResult, RESULT_JSON_SCHEMA } from '@/lib/admin/offers/result'
import { fireRoutine, type FireRoutine } from '@/lib/admin/offers/routine'
import {
  briefForRoutine,
  claimResearch,
  DAILY_RUN_LIMIT,
  deleteResearch,
  failResearch,
  getResearch,
  listResearchForContact,
  loadBriefForContact,
  maintainOfferResearch,
  researchSetup,
  retryFire,
  startResearch,
  webFromEmail,
} from '@/lib/admin/offers/research'
import { POST as claimRoute } from '@/app/api/public/rozbory/route'
import { POST as submitRoute } from '@/app/api/public/rozbory/[id]/route'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const KEY = 'k'.repeat(40)

const SCHEMA = `
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO admin_settings (id) VALUES (true);
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL);
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, company text, email text, phone text,
  ico text, merged_into uuid REFERENCES contacts(id)
);
CREATE TABLE outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_updated_at timestamptz NOT NULL DEFAULT now(),
  company_name text NOT NULL, website text, industry text, city text, research jsonb,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
);
`

/** Platný výsledek, jak by ho poslala úloha. */
function goodInput(extra: Record<string, unknown> = {}) {
  return {
    sources: [
      { url: 'https://studny-novak.cz/', title: 'Web firmy' },
      { url: 'https://ares.gov.cz/firma/12345678', title: 'ARES' },
      { url: 'javascript:alert(1)', title: 'Zlé' },
      { url: 'https://studny-novak.cz/', title: 'Duplicita' },
    ],
    web: {
      url: 'https://studny-novak.cz',
      exists: true,
      state: 'outdated',
      tech: 'Webnode',
      findings: [
        { text: 'Web nemá ceník.', sources: [0] },
        { text: 'Tvrzení bez zdroje.', sources: [] },
        { text: 'Tvrzení jen se zlým zdrojem.', sources: [2] },
      ],
      gaps: [{ text: 'Chybí poptávkový formulář.', sources: [3] }],
    },
    company: {
      summary: 'Rodinná firma, která vrtá studny na Kroměřížsku.',
      industry: 'studny',
      city: 'Kroměříž',
      ico: '12 34 56 78',
      legal_form: 's.r.o.',
      founded_year: 2008,
      findings: [{ text: 'Firma existuje od roku 2008.', sources: [1] }],
    },
    reviews: { count: 42, rating: 4.83, sources: [], praised: [], criticized: [] },
    typical_job: { min_czk: 180000, max_czk: 60000, confidence: 'high', reasoning: 'Z ceníků konkurence.', sources: [] },
    competitors: [
      { name: 'Studny Kroměříž', url: 'https://konkurent.cz', note: 'Má ceník.', sources: [1] },
      { name: 'Bez zdroje', url: null, note: '', sources: [] },
    ],
    signals: [{ text: 'Tři vrtné soupravy na fotkách.', direction: 'up', sources: [0] }],
    warnings: [],
    ask_client: ['Kolik stojí typický vrt?', ''],
    ...extra,
  }
}

/* ------------------------------------------------------------------ */
/* Kontrola výsledku                                                   */
/* ------------------------------------------------------------------ */

describe('normalizeResult: co z rozboru smí do databáze', () => {
  it('zahodí zlé a zdvojené zdroje, přečísluje indexy a zahodí tvrzení bez zdroje', () => {
    const out = normalizeResult(goodInput())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const r = out.result
    expect(r.sources.map((s) => s.url)).toEqual(['https://studny-novak.cz/', 'https://ares.gov.cz/firma/12345678'])
    expect(r.web.findings).toEqual([{ text: 'Web nemá ceník.', sources: [0] }])
    // Duplicitní zdroj [3] míří na tentýž web jako [0].
    expect(r.web.gaps).toEqual([{ text: 'Chybí poptávkový formulář.', sources: [0] }])
    expect(r.competitors.map((c) => c.name)).toEqual(['Studny Kroměříž'])
    expect(r.dropped).toBe(3)
  })

  it('recenze bez zdroje nemají čísla, odhad bez zdroje má nízkou jistotu a srovnané meze', () => {
    const out = normalizeResult(goodInput())
    if (!out.ok) throw new Error('mělo projít')
    expect(out.result.reviews.count).toBeNull()
    expect(out.result.reviews.rating).toBeNull()
    expect(out.result.typical_job).toMatchObject({ min_czk: 60000, max_czk: 180000, confidence: 'low' })
  })

  it('IČO jen 8 číslic, prázdné otázky pryč, web firmy jen bezpečná adresa', () => {
    const out = normalizeResult(goodInput({ ask_client: ['Kolik?', '  '] }))
    if (!out.ok) throw new Error('mělo projít')
    expect(out.result.company.ico).toBe('12345678')
    expect(out.result.ask_client).toEqual(['Kolik?'])
    const bad = normalizeResult(goodInput({ web: { ...goodInput().web, url: 'javascript:alert(1)' } }))
    if (!bad.ok) throw new Error('mělo projít')
    expect(bad.result.web.url).toBeNull()
  })

  it('ořízne dlouhé texty a řídicí znaky', () => {
    const long = 'a'.repeat(2000)
    const out = normalizeResult(goodInput({ company: { ...goodInput().company, summary: `Firma\u0007 ${long}` } }))
    if (!out.ok) throw new Error('mělo projít')
    expect(out.result.company.summary.length).toBeLessThanOrEqual(700)
    expect(out.result.company.summary).not.toContain('\u0007')
  })

  it('nesmysl nebo rozbor bez shrnutí firmy = invalid_result', () => {
    expect(normalizeResult('ahoj')).toEqual({ ok: false, reason: 'invalid_result' })
    expect(normalizeResult(null)).toEqual({ ok: false, reason: 'invalid_result' })
    expect(normalizeResult(goodInput({ company: { ...goodInput().company, summary: '' } }))).toEqual({
      ok: false,
      reason: 'invalid_result',
    })
  })
})

describe('zadání pro úlohu', () => {
  it('web z e-mailu jen u vlastní domény', () => {
    expect(webFromEmail('info@studny-novak.cz')).toBe('https://studny-novak.cz')
    expect(webFromEmail('novak@seznam.cz')).toBeNull()
    expect(webFromEmail('novak@gmail.com')).toBeNull()
    expect(webFromEmail(null)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* Spuštění cloudové úlohy                                             */
/* ------------------------------------------------------------------ */

describe('fireRoutine: spuštění úlohy v Claude Code', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('OFFER_RESEARCH_ROUTINE_ID', '')
    vi.stubEnv('OFFER_RESEARCH_FIRE_TOKEN', '')
  })

  it('bez id úlohy nebo klíče se nic neposílá', async () => {
    const fetchImpl = vi.fn()
    expect(await fireRoutine('x', fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, reason: 'not_configured' })
    vi.stubEnv('OFFER_RESEARCH_ROUTINE_ID', 'neni-trigger')
    vi.stubEnv('OFFER_RESEARCH_FIRE_TOKEN', 'tajne')
    expect(await fireRoutine('x', fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, reason: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('pošle jen id rozboru a vrátí běh; cizí odkaz na běh zahodí', async () => {
    vi.stubEnv('OFFER_RESEARCH_ROUTINE_ID', 'trig_01AbCdEfGh')
    vi.stubEnv('OFFER_RESEARCH_FIRE_TOKEN', 'tajne')
    const fetchImpl = vi.fn(async () =>
      Response.json({ type: 'routine_fire', claude_code_session_id: 'cse_123', claude_code_session_url: 'https://claude.ai/code/session_123' }),
    )
    const out = await fireRoutine('11111111-2222-4333-8444-555555555555', fetchImpl as unknown as typeof fetch)
    expect(out).toEqual({ ok: true, sessionId: 'cse_123', sessionUrl: 'https://claude.ai/code/session_123' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/claude_code/routines/trig_01AbCdEfGh/fire')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tajne')
    expect(JSON.parse(String(init.body))).toEqual({ text: JSON.stringify({ rozbor: '11111111-2222-4333-8444-555555555555' }) })

    const evil = vi.fn(async () => Response.json({ claude_code_session_id: 'cse_1', claude_code_session_url: 'https://zly.cz/' }))
    expect(await fireRoutine('x', evil as unknown as typeof fetch)).toMatchObject({ ok: true, sessionUrl: null })
  })

  it('429 je limit, ostatní chyby i výjimka jsou neúspěch', async () => {
    vi.stubEnv('OFFER_RESEARCH_ROUTINE_ID', 'trig_01AbCdEfGh')
    vi.stubEnv('OFFER_RESEARCH_FIRE_TOKEN', 'tajne')
    const status = (s: number) => vi.fn(async () => new Response('{}', { status: s })) as unknown as typeof fetch
    expect(await fireRoutine('x', status(429))).toEqual({ ok: false, reason: 'rate_limited' })
    expect(await fireRoutine('x', status(401))).toEqual({ ok: false, reason: 'failed' })
    const boom = vi.fn(async () => {
      throw new Error('síť')
    }) as unknown as typeof fetch
    expect(await fireRoutine('x', boom)).toEqual({ ok: false, reason: 'failed' })
  })
})

/* ------------------------------------------------------------------ */
/* Databáze                                                            */
/* ------------------------------------------------------------------ */

async function insertContact(values: { name?: string; company?: string | null; email?: string | null; ico?: string | null } = {}) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO contacts (display_name, company, email, phone, ico) VALUES ($1, $2, $3, '+420777111222', $4) RETURNING id::text`,
    [
      values.name ?? 'Jan Novák',
      values.company === undefined ? 'Studny Novák' : values.company,
      values.email ?? 'info@studny-novak.cz',
      values.ico ?? '12345678',
    ],
  )
  return rows[0].id
}

const fired: FireRoutine = async () => ({ ok: true, sessionId: 'cse_abc', sessionUrl: 'https://claude.ai/code/session_abc' })
const notFired: FireRoutine = async () => ({ ok: false, reason: 'failed' })

function req(url: string, body: unknown, key: string | null = KEY): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const claimUrl = 'https://www.zakaziq.cz/api/public/rozbory'
const submit = (id: string, body: unknown, key: string | null = KEY) =>
  submitRoute(req(`${claimUrl}/${id}`, body, key), { params: Promise.resolve({ id }) })

describe('rozbor proti Postgresu s migracemi 136 a 137', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    for (const file of ['136_navrhovac_rozbor.sql', '137_navrhovac_fronta.sql']) {
      const sql = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
      await db.exec(sql)
      await db.exec(sql) // idempotence
    }
    setAdminDbForTests(pgliteAdminDriver(db))
  })
  afterAll(() => {
    setAdminDbForTests(null)
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('OFFER_RESEARCH_API_KEY', KEY)
    vi.stubEnv('OFFER_RESEARCH_ROUTINE_ID', '')
    vi.stubEnv('OFFER_RESEARCH_FIRE_TOKEN', '')
    notifications.length = 0
    await db.exec(`DELETE FROM offer_research; DELETE FROM outreach_leads; DELETE FROM contacts; DELETE FROM projects;`)
  })

  it('stav propojení: bez klíče nic, bez spouštění jen fronta', async () => {
    vi.stubEnv('OFFER_RESEARCH_API_KEY', '')
    expect(researchSetup()).toBe('not_connected')
    const contactId = await insertContact()
    expect(await startResearch({ contactId }, fired)).toEqual({ ok: false, error: 'not_connected' })

    vi.stubEnv('OFFER_RESEARCH_API_KEY', KEY)
    expect(researchSetup()).toBe('queue_only')
    vi.stubEnv('OFFER_RESEARCH_ROUTINE_ID', 'trig_01AbCdEfGh')
    vi.stubEnv('OFFER_RESEARCH_FIRE_TOKEN', 'tajne')
    expect(researchSetup()).toBe('ready')
  })

  it('zadání nese jen veřejné údaje o firmě: bez telefonu a e-mailu', async () => {
    const contactId = await insertContact()
    await db.query(
      `INSERT INTO outreach_leads (company_name, website, industry, city, research, contact_id)
       VALUES ('Studny Novák', 'https://studny-novak.cz', 'studny', 'Kroměříž', $1, $2)`,
      [JSON.stringify({ angle: 'Starý web na Webnode', findings: ['Bez ceníku'] }), contactId],
    )
    const brief = await loadBriefForContact(contactId)
    expect(brief).toMatchObject({ company: 'Studny Novák', web: 'https://studny-novak.cz/', city: 'Kroměříž', industry: 'studny', ico: '12345678' })
    expect(brief?.prior).toEqual(['Starý web na Webnode', 'Bez ceníku'])
    const text = JSON.stringify(briefForRoutine(brief!))
    expect(text).not.toContain('+420777111222')
    expect(text).not.toContain('info@studny-novak.cz')

    // Web zadaný ručně má přednost; neplatný se ignoruje.
    expect((await loadBriefForContact(contactId, 'https://jiny-web.cz'))?.web).toBe('https://jiny-web.cz/')
    expect((await loadBriefForContact(contactId, 'javascript:alert(1)'))?.web).toBe('https://studny-novak.cz/')
  })

  it('kontakt pojmenovaný e-mailem nepošle adresu ani jako název firmy', async () => {
    const contactId = await insertContact({ name: 'novak@studny-novak.cz', company: null })
    const brief = await loadBriefForContact(contactId)
    expect(brief?.company).toBe('Firma')
    expect(brief?.person).toBeNull()
    expect(JSON.stringify(briefForRoutine(brief!))).not.toContain('novak@')
  })

  it('celý tok: fronta → spuštění → vyzvednutí → odevzdání → hotovo a zvonek', async () => {
    const contactId = await insertContact()
    const started = await startResearch({ contactId }, fired)
    expect(started).toMatchObject({ ok: true, fired: true })
    if (!started.ok) return
    expect(await getResearch(started.id)).toMatchObject({ status: 'queued', session_url: 'https://claude.ai/code/session_abc' })

    // Úloha bez klíče nic nevyzvedne.
    expect((await claimRoute(req(claimUrl, {}, null))).status).toBe(401)
    expect((await claimRoute(req(claimUrl, {}, 'spatny'.repeat(8)))).status).toBe(401)

    const claimed = await claimRoute(req(claimUrl, { id: started.id }))
    expect(claimed.status).toBe(200)
    const body = (await claimed.json()) as { rozbor: { id: string; zadani: Record<string, unknown>; schema: unknown; odevzdat: string } }
    expect(body.rozbor.id).toBe(started.id)
    expect(body.rozbor.zadani).toMatchObject({ firma: 'Studny Novák', web: 'https://studny-novak.cz', ico: '12345678' })
    expect(JSON.stringify(body)).not.toContain('+420777111222')
    expect(body.rozbor.schema).toEqual(RESULT_JSON_SCHEMA)
    expect(body.rozbor.odevzdat).toBe(`/api/public/rozbory/${started.id}`)
    expect((await getResearch(started.id))?.status).toBe('running')

    // Druhé vyzvednutí už nic nedostane (i s prázdným tělem).
    expect(await (await claimRoute(req(claimUrl, undefined))).json()).toEqual({ success: true, rozbor: null })

    // Rozbitý výsledek: 422 a rozbor běží dál, oprava projde.
    expect((await submit(started.id, { vysledek: { nic: 1 } })).status).toBe(422)
    expect((await getResearch(started.id))?.status).toBe('running')
    expect((await submit(started.id, { vysledek: goodInput() })).status).toBe(200)

    const row = await getResearch(started.id)
    expect(row).toMatchObject({ status: 'done', error: null })
    expect(row?.result?.company.summary).toContain('studny')
    expect(row?.result?.dropped).toBe(3)
    expect(notifications).toEqual([
      expect.objectContaining({ type: 'offer_research_done', link: `/dashboard/kontakty/${contactId}` }),
    ])

    // Po dokončení už nic nepřepíše.
    expect((await submit(started.id, { vysledek: goodInput() })).status).toBe(409)
  })

  it('vstupy pro úlohu odmítnou cizí tělo, špatné id a velké tělo', async () => {
    expect((await claimRoute(req(claimUrl, { id: 'neni-uuid' }))).status).toBe(400)
    expect((await claimRoute(req(claimUrl, { id: null, navic: 1 }))).status).toBe(400)
    expect((await submit('neni-uuid', { vysledek: goodInput() })).status).toBe(404)
    expect((await submit('11111111-2222-4333-8444-555555555555', { vysledek: goodInput() })).status).toBe(404)
    expect((await submit('11111111-2222-4333-8444-555555555555', { neco: 1 })).status).toBe(400)
    expect((await submit('11111111-2222-4333-8444-555555555555', { vysledek: { a: 'x'.repeat(300_000) } })).status).toBe(413)
  })

  it('úloha může rozbor vzdát; text důvodu se neukládá', async () => {
    const contactId = await insertContact()
    const started = await startResearch({ contactId }, fired)
    if (!started.ok) throw new Error('mělo se spustit')
    await claimResearch(null)
    expect((await submit(started.id, { nepodarilo_se: 'Web nejde otevřít <script>' })).status).toBe(200)
    expect(await getResearch(started.id)).toMatchObject({ status: 'failed', error: 'gave_up' })
    expect(await failResearch(started.id)).toEqual({ ok: false, reason: 'not_running' })
  })

  it('nespuštěná úloha: rozbor čeká ve frontě, znovu spustit jde, vyzvedne se i bez id', async () => {
    const contactId = await insertContact()
    const started = await startResearch({ contactId }, notFired)
    expect(started).toMatchObject({ ok: true, fired: false })
    if (!started.ok) return
    expect(await getResearch(started.id)).toMatchObject({ status: 'queued', error: 'fire_failed', session_url: null })

    expect(await retryFire(started.id, fired)).toMatchObject({ status: 'queued', error: null, session_url: 'https://claude.ai/code/session_abc' })
    const claimed = await claimResearch(null)
    expect(claimed?.id).toBe(started.id)
    // Běžící už znovu spustit nejde.
    const calls = vi.fn(fired)
    await retryFire(started.id, calls)
    expect(calls).not.toHaveBeenCalled()
  })

  it('přednostně se vyzvedne rozbor, pro který byla úloha spuštěna', async () => {
    const a = await startResearch({ contactId: await insertContact({ company: 'A' }) }, notFired)
    const b = await startResearch({ contactId: await insertContact({ company: 'B' }) }, notFired)
    if (!a.ok || !b.ok) throw new Error('měly se spustit')
    expect((await claimResearch(b.id))?.id).toBe(b.id)
    expect((await claimResearch(b.id))?.id).toBe(a.id)
    expect(await claimResearch(null)).toBeNull()
  })

  it('jeden otevřený rozbor na kontakt a denní strop', async () => {
    const contactId = await insertContact()
    expect((await startResearch({ contactId }, fired)).ok).toBe(true)
    expect(await startResearch({ contactId }, fired)).toEqual({ ok: false, error: 'already_running' })
    await claimResearch(null)
    expect(await startResearch({ contactId }, fired)).toEqual({ ok: false, error: 'already_running' })

    const other = await insertContact({ company: 'Jiná' })
    await db.exec(
      Array.from({ length: DAILY_RUN_LIMIT }, () => `INSERT INTO offer_research (contact_id, status, brief) VALUES ('${other}', 'done', '{}'::jsonb);`).join('\n'),
    )
    expect(await startResearch({ contactId: other }, fired)).toEqual({ ok: false, error: 'daily_limit' })
  })

  it('smazání kontaktu smaže i rozbor; smazání rozboru', async () => {
    const contactId = await insertContact()
    const started = await startResearch({ contactId }, fired)
    if (!started.ok) throw new Error('mělo se spustit')
    expect(await deleteResearch(started.id)).toBe(true)
    expect(await deleteResearch(started.id)).toBe(false)

    await db.exec(`INSERT INTO offer_research (contact_id, status, brief) VALUES ('${contactId}', 'done', '{}'::jsonb)`)
    await db.exec(`DELETE FROM contacts WHERE id = '${contactId}'`)
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM offer_research`)
    expect(rows[0].n).toBe(0)
  })

  it('údržba: zaseknuté a nevyzvednuté ukončí, staré bez zakázky smaže, otevřené a se zakázkou nechá', async () => {
    const contactId = await insertContact()
    const c2 = await insertContact({ company: 'Druhá' })
    const c3 = await insertContact({ company: 'Třetí' })
    const { rows: projects } = await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Studny') RETURNING id::text`)
    await db.exec(`
      INSERT INTO offer_research (contact_id, status, brief, updated_at) VALUES ('${contactId}', 'done', '{}'::jsonb, now() - interval '13 months');
      INSERT INTO offer_research (contact_id, status, brief, updated_at) VALUES ('${contactId}', 'failed', '{}'::jsonb, now() - interval '11 months');
      INSERT INTO offer_research (contact_id, status, brief, updated_at, project_id)
        VALUES ('${contactId}', 'done', '{}'::jsonb, now() - interval '13 months', '${projects[0].id}');
      INSERT INTO offer_research (contact_id, status, brief, claimed_at, updated_at)
        VALUES ('${contactId}', 'running', '{}'::jsonb, now() - interval '2 hours', now() - interval '13 months');
      INSERT INTO offer_research (contact_id, status, brief, created_at) VALUES ('${c2}', 'queued', '{}'::jsonb, now() - interval '31 hours');
      INSERT INTO offer_research (contact_id, status, brief) VALUES ('${c3}', 'queued', '{}'::jsonb);
    `)
    expect(await maintainOfferResearch()).toEqual({ timedOut: 2, purged: 1 })
    const rows = await listResearchForContact(contactId, 10)
    expect(rows.map((r) => r.error).filter(Boolean)).toEqual(['timeout'])
    expect((await listResearchForContact(c2))[0]).toMatchObject({ status: 'failed', error: 'not_started' })
    expect((await listResearchForContact(c3))[0]).toMatchObject({ status: 'queued' })
  })
})
