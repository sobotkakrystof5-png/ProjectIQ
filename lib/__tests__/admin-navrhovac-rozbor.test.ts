import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Navrhovač nabídek, krok N1: rozbor firmy (R-147). Kontrola výsledku od
 * agentů (B10: tvrzení bez zdroje se zahodí), rozhodování o běhu, nastavení
 * agentů a celý tok proti skutečnému Postgresu s migrací 136.
 * Anthropic se nevolá: API je podstrčené.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

vi.mock('@/lib/db', () => ({ sql: async () => [] }))

import { setAdminDbForTests } from '@/lib/admin/db'
import { normalizeResult, RESULT_TOOL_NAME } from '@/lib/admin/offers/result'
import { configHash, environmentSpec, leadSpec, RUN_TIMEOUT_MS, workerSpecs } from '@/lib/admin/offers/agent-config'
import type { OfferApi, OfferEvent } from '@/lib/admin/offers/api'
import {
  briefMessage,
  decide,
  deleteResearch,
  listResearchForContact,
  loadAgentSetup,
  loadBriefForContact,
  maintainOfferResearch,
  refreshResearch,
  setupAgents,
  startResearch,
  webFromEmail,
} from '@/lib/admin/offers/research'
import { aiModel } from '@/lib/ai/models'
import { pgliteAdminDriver } from './helpers/admin-pglite'

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

/** Platný výsledek, jak by ho poslal vedoucí agent. */
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

describe('normalizeResult: co od agentů smí do databáze', () => {
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

describe('decide: co s během dál', () => {
  const tool = (input: unknown): OfferEvent => ({ type: 'custom_tool_use', name: RESULT_TOOL_NAME, input })

  it('odevzdaný výsledek vyhrává', () => {
    const d = decide([{ type: 'other' }, tool(goodInput()), { type: 'idle', stopReason: 'requires_action' }], 'idle', 1000)
    expect(d.kind).toBe('done')
  })

  it('rozbitý výsledek = invalid_result', () => {
    expect(decide([tool({ nic: true })], 'idle', 1000)).toEqual({ kind: 'failed', error: 'invalid_result' })
  })

  it('čekající schválení odmítne, už odpovězené ne', () => {
    const events: OfferEvent[] = [
      { type: 'tool_ask', id: 'sevt_1' },
      { type: 'tool_confirmation', toolUseId: 'sevt_1' },
      { type: 'tool_ask', id: 'sevt_2' },
    ]
    expect(decide(events, 'idle', 1000)).toEqual({ kind: 'deny', ids: ['sevt_2'] })
  })

  it('strop ceny, konec bez výsledku, chyba a dlouhý běh', () => {
    expect(decide([{ type: 'idle', stopReason: 'budget_reached' }], 'idle', 1000)).toEqual({ kind: 'failed', error: 'budget' })
    expect(decide([{ type: 'idle', stopReason: 'end_turn' }], 'idle', 1000)).toEqual({ kind: 'failed', error: 'no_result' })
    expect(decide([], 'terminated', 1000)).toEqual({ kind: 'failed', error: 'terminated' })
    expect(decide([], 'running', RUN_TIMEOUT_MS + 1)).toEqual({ kind: 'failed', error: 'timeout' })
    expect(decide([{ type: 'other' }], 'running', 1000)).toEqual({ kind: 'wait' })
  })
})

describe('nastavení agentů v kódu', () => {
  it('agenti mají jen hledání a čtení webů, žádný příkazový řádek ani soubory', () => {
    for (const spec of [...workerSpecs(), leadSpec({ web: 'a', research: 'b' })]) {
      const tools = spec.body.tools as Array<Record<string, unknown>>
      const toolset = tools.find((t) => t.type === 'agent_toolset_20260401') as {
        default_config: { enabled: boolean }
        configs: Array<{ name: string; enabled: boolean }>
      }
      expect(toolset.default_config.enabled).toBe(false)
      expect(toolset.configs.filter((c) => c.enabled).map((c) => c.name).sort()).toEqual(['web_fetch', 'web_search'])
      expect(tools.some((t) => t.type === 'mcp_toolset')).toBe(false)
    }
  })

  it('výsledek vrací jen vedoucí, modely jdou přes lib/ai/models.ts', () => {
    const lead = leadSpec({ web: 'agent_web', research: 'agent_res' }).body
    const custom = (lead.tools as Array<Record<string, unknown>>).filter((t) => t.type === 'custom')
    expect(custom.map((t) => t.name)).toEqual([RESULT_TOOL_NAME])
    expect(lead.multiagent).toEqual({ type: 'coordinator', agents: ['agent_web', 'agent_res'] })
    expect(lead.model).toBe(aiModel('deep'))
    expect(workerSpecs().map((w) => w.body.model)).toEqual([aiModel('fast'), aiModel('smart')])
  })

  it('prostředí s neomezeným přístupem na web (Kryštof 2026-11-25), otisk je stálý', () => {
    expect(environmentSpec().config).toEqual({ type: 'cloud', networking: { type: 'unrestricted' } })
    expect(configHash()).toBe(configHash())
    expect(configHash()).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('zadání pro agenty', () => {
  it('web z e-mailu jen u vlastní domény', () => {
    expect(webFromEmail('info@studny-novak.cz')).toBe('https://studny-novak.cz')
    expect(webFromEmail('novak@seznam.cz')).toBeNull()
    expect(webFromEmail('novak@gmail.com')).toBeNull()
    expect(webFromEmail(null)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* Databáze                                                            */
/* ------------------------------------------------------------------ */

function fakeApi(overrides: Partial<OfferApi> = {}) {
  let n = 0
  const calls = { created: [] as string[], updated: [] as string[], deleted: [] as string[], denied: [] as string[][], messages: [] as string[] }
  const api: OfferApi = {
    async createEnvironment() {
      calls.created.push('env')
      return { id: 'env_1' }
    },
    async updateEnvironment(id) {
      calls.updated.push(id)
      return { id }
    },
    async createAgent(body) {
      n++
      calls.created.push(String(body.name))
      return { id: `agent_${n}`, version: 1 }
    },
    async updateAgent(id, version) {
      calls.updated.push(id)
      return { id, version: version + 1 }
    },
    async startSession(input) {
      calls.messages.push(input.message)
      return { id: `sesn_${Math.random().toString(36).slice(2, 10)}` }
    },
    async getSession() {
      return { status: 'idle', costCents: 73, activeSeconds: 240 }
    },
    async listEvents() {
      return [{ type: 'custom_tool_use', name: RESULT_TOOL_NAME, input: goodInput() }]
    },
    async denyTools(_s, ids) {
      calls.denied.push(ids)
    },
    async interruptSession() {},
    async deleteSession(id) {
      calls.deleted.push(id)
    },
    ...overrides,
  }
  return { api, calls }
}

async function insertContact(values: { name?: string; company?: string | null; email?: string | null; ico?: string | null } = {}) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO contacts (display_name, company, email, phone, ico) VALUES ($1, $2, $3, '+420777111222', $4) RETURNING id::text`,
    [values.name ?? 'Jan Novák', values.company ?? 'Studny Novák', values.email ?? 'info@studny-novak.cz', values.ico ?? '12345678'],
  )
  return rows[0].id
}

describe('rozbor proti Postgresu s migrací 136', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', '136_navrhovac_rozbor.sql'), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // idempotence
    setAdminDbForTests(pgliteAdminDriver(db))
  })
  afterAll(() => {
    setAdminDbForTests(null)
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test')
    await db.exec(
      `DELETE FROM offer_research; DELETE FROM outreach_leads; DELETE FROM contacts; UPDATE admin_settings SET offer_agents = NULL;`,
    )
  })

  it('bez klíče k AI se nic nespustí a stav říká proč', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    expect(await loadAgentSetup()).toEqual({ status: 'no_api_key' })
    const contactId = await insertContact()
    expect(await startResearch({ contactId }, fakeApi().api)).toEqual({ ok: false, error: 'no_api_key' })
  })

  it('nastavení agentů založí prostředí a tři agenty, podruhé je aktualizuje', async () => {
    expect(await loadAgentSetup()).toEqual({ status: 'missing' })
    const first = fakeApi()
    expect(await setupAgents(first.api)).toEqual({ ok: true })
    expect(first.calls.created).toEqual(['env', 'Analytik webů', 'Rešeršista firem', 'Navrhovač nabídek – rozbor firmy'])
    expect(await loadAgentSetup()).toEqual({ status: 'ready' })

    // Jiný otisk (změněný kód) → stav „outdated", tlačítko agenty aktualizuje, nezakládá nové.
    await db.exec(`UPDATE admin_settings SET offer_agents = jsonb_set(offer_agents, '{hash}', '"stary"')`)
    expect(await loadAgentSetup()).toEqual({ status: 'outdated' })
    const second = fakeApi()
    expect(await setupAgents(second.api)).toEqual({ ok: true })
    expect(second.calls.created).toEqual([])
    expect(second.calls.updated).toEqual(['env_1', 'agent_1', 'agent_2', 'agent_3'])
    const { rows } = await db.query<{ v: number }>(`SELECT (offer_agents->'agents'->'lead'->>'version')::int AS v FROM admin_settings`)
    expect(rows[0].v).toBe(2)
  })

  it('selhání u Anthropicu nastavení neuloží', async () => {
    const { api } = fakeApi({
      async createAgent() {
        throw Object.assign(new Error('nope'), { status: 400 })
      },
    })
    expect(await setupAgents(api)).toEqual({ ok: false, error: 'setup_failed' })
    expect(await loadAgentSetup()).toEqual({ status: 'missing' })
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
    const message = briefMessage(brief!)
    expect(message).not.toContain('+420777111222')
    expect(message).not.toContain('info@studny-novak.cz')

    // Web zadaný ručně má přednost; neplatný se ignoruje.
    expect((await loadBriefForContact(contactId, 'https://jiny-web.cz'))?.web).toBe('https://jiny-web.cz/')
    expect((await loadBriefForContact(contactId, 'javascript:alert(1)'))?.web).toBe('https://studny-novak.cz/')
  })

  it('celý tok: spuštění, převzetí výsledku, smazání běhu u Anthropicu', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    const { api, calls } = fakeApi()

    const started = await startResearch({ contactId }, api)
    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(calls.messages[0]).toContain('ulozit_rozbor')

    // Dvojklik: druhý běh u stejného kontaktu se nespustí.
    expect(await startResearch({ contactId }, api)).toEqual({ ok: false, error: 'already_running' })

    const row = await refreshResearch(started.id, api)
    expect(row?.status).toBe('done')
    expect(row?.cost_cents).toBe(73)
    expect(row?.result?.company.summary).toContain('studny')
    expect(calls.deleted).toHaveLength(1)

    // Další obnovení už nic nevolá a vrací uložený výsledek.
    const again = await refreshResearch(started.id, api)
    expect(again?.status).toBe('done')
    expect(calls.deleted).toHaveLength(1)
    expect((await listResearchForContact(contactId)).map((r) => r.status)).toEqual(['done'])
  })

  it('rozbitý výsledek skončí jako nepovedený a běh se smaže', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    const { api, calls } = fakeApi({
      async listEvents() {
        return [{ type: 'custom_tool_use', name: RESULT_TOOL_NAME, input: { nic: 1 } }]
      },
    })
    const started = await startResearch({ contactId }, api)
    if (!started.ok) throw new Error('mělo se spustit')
    const row = await refreshResearch(started.id, api)
    expect(row).toMatchObject({ status: 'failed', error: 'invalid_result', result: null })
    expect(calls.deleted).toHaveLength(1)
  })

  it('běžící rozbor jen aktualizuje cenu a čeká; čekající krok odmítne', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    const { api, calls } = fakeApi({
      async getSession() {
        return { status: 'running', costCents: 12, activeSeconds: 30 }
      },
      async listEvents() {
        return [{ type: 'other' }]
      },
    })
    const started = await startResearch({ contactId }, api)
    if (!started.ok) throw new Error('mělo se spustit')
    expect(await refreshResearch(started.id, api)).toMatchObject({ status: 'running', cost_cents: 12 })

    const asking = fakeApi({
      async getSession() {
        return { status: 'idle', costCents: 15, activeSeconds: 40 }
      },
      async listEvents() {
        return [{ type: 'tool_ask', id: 'sevt_9' }]
      },
    })
    expect(await refreshResearch(started.id, asking.api)).toMatchObject({ status: 'running' })
    expect(asking.calls.denied).toEqual([['sevt_9']])
    expect(calls.deleted).toEqual([])
  })

  it('denní strop a spuštění se starým nastavením', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    await db.exec(`
      INSERT INTO offer_research (contact_id, status, brief)
      SELECT '${contactId}', 'done', '{}'::jsonb FROM generate_series(1, 15)`)
    expect(await startResearch({ contactId }, fakeApi().api)).toEqual({ ok: false, error: 'daily_limit' })

    await db.exec(`DELETE FROM offer_research; UPDATE admin_settings SET offer_agents = jsonb_set(offer_agents, '{hash}', '"stary"')`)
    expect(await startResearch({ contactId }, fakeApi().api)).toEqual({ ok: false, error: 'outdated' })
  })

  it('selhání spuštění u Anthropicu zapíše nepovedený běh, ne zaseknutý', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    const { api } = fakeApi({
      async startSession() {
        throw Object.assign(new Error('rate'), { status: 429 })
      },
    })
    expect(await startResearch({ contactId }, api)).toEqual({ ok: false, error: 'start_failed' })
    expect((await listResearchForContact(contactId))[0]).toMatchObject({ status: 'failed', error: 'start_failed' })
  })

  it('smazání kontaktu smaže i rozbor; smazání rozboru ukončí běh', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    const { api, calls } = fakeApi({
      async getSession() {
        return { status: 'running', costCents: 1, activeSeconds: 1 }
      },
      async listEvents() {
        return []
      },
    })
    const started = await startResearch({ contactId }, api)
    if (!started.ok) throw new Error('mělo se spustit')
    expect(await deleteResearch(started.id, api)).toBe(true)
    expect(calls.deleted).toHaveLength(1)

    await db.exec(`INSERT INTO offer_research (contact_id, status, brief) VALUES ('${contactId}', 'done', '{}'::jsonb)`)
    await db.exec(`DELETE FROM contacts WHERE id = '${contactId}'`)
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM offer_research`)
    expect(rows[0].n).toBe(0)
  })

  it('úklid: bez zakázky po 12 měsících pryč, se zakázkou a běžící zůstávají; doběhlé převezme', async () => {
    await setupAgents(fakeApi().api)
    const contactId = await insertContact()
    const { rows: projects } = await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Studny') RETURNING id::text`)
    await db.exec(`
      INSERT INTO offer_research (contact_id, status, brief, updated_at) VALUES ('${contactId}', 'done', '{}'::jsonb, now() - interval '13 months');
      INSERT INTO offer_research (contact_id, status, brief, updated_at) VALUES ('${contactId}', 'failed', '{}'::jsonb, now() - interval '11 months');
      INSERT INTO offer_research (contact_id, status, brief, updated_at, project_id)
        VALUES ('${contactId}', 'done', '{}'::jsonb, now() - interval '13 months', '${projects[0].id}');
      INSERT INTO offer_research (contact_id, status, brief, session_id, created_at, updated_at)
        VALUES ('${contactId}', 'running', '{}'::jsonb, 'sesn_stary', now() - interval '1 hour', now() - interval '13 months');
    `)
    const { api, calls } = fakeApi()
    const out = await maintainOfferResearch(api)
    expect(out).toEqual({ refreshed: 1, purged: 1 })
    expect(calls.deleted).toEqual(['sesn_stary'])
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM offer_research`)
    expect(rows[0].n).toBe(3)
  })
})
