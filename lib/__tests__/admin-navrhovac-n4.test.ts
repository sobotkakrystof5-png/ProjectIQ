import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Navrhovač nabídek N4 (R-158): rozbor firmy se spustí sám (souhlas firmy od
 * asistenta, poptávka z webu), když není podle čeho hledat, nebo se nepovede,
 * přijde upozornění; ze schůzky ve Voice se navrhnou vstupy nabídky jen
 * s citací, která v přepisu opravdu je.
 */

const ROOT = path.resolve(__dirname, '../..')
const KEY = 'k'.repeat(40)
let db: PGlite

const notifications = vi.hoisted(() => [] as { type: string; title: string; body?: string; link?: string }[])

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/lib/notifications', () => ({
  createNotification: async (n: { type: string; title: string; body?: string; link?: string }) => {
    notifications.push(n)
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import type { FireRoutine } from '@/lib/admin/offers/routine'
import { claimResearch, failResearch, maintainOfferResearch } from '@/lib/admin/offers/research'
import {
  AUTO_DAILY_LIMIT,
  autoResearchAfterConsent,
  autoStartResearch,
  hasSomethingToSearch,
  researchAfterWebLead,
  WEB_LEAD_NOTHING_TO_SEARCH,
  webLabel,
  webLeadResearchNote,
  webLeadSite,
} from '@/lib/admin/offers/auto-research'
import { checkHints, foldForQuote, quoteHasAmount, quoteInTranscript } from '@/lib/admin/offers/meeting-hints-check'
import { extractMeetingHints, latestMeetingForContact } from '@/lib/admin/offers/meeting-hints'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO admin_settings (id) VALUES (true);
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL, company text, email text, phone text, source text,
  ico text, dic text, note text,
  merged_into uuid REFERENCES contacts(id) ON DELETE SET NULL,
  last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);
CREATE UNIQUE INDEX contacts_email_uq ON contacts (lower(email)) WHERE merged_into IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone_uq ON contacts (phone) WHERE merged_into IS NULL AND phone IS NOT NULL;
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE TABLE outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_updated_at timestamptz NOT NULL DEFAULT now(),
  company_name text NOT NULL, website text, industry text, city text, research jsonb,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
);
`

const started: string[] = []
const fire: FireRoutine = async (id) => {
  started.push(id)
  return { ok: true, sessionId: `s_${started.length}`, sessionUrl: null }
}

async function contact(values: { name: string; company?: string | null; email?: string | null; ico?: string | null }) {
  const rows = await db.query<{ id: string }>(
    `INSERT INTO contacts (display_name, company, email, ico) VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [values.name, values.company ?? null, values.email ?? null, values.ico ?? null],
  )
  return rows.rows[0].id
}

async function firmFor(contactId: string, website: string | null = null) {
  await db.query(`INSERT INTO outreach_leads (company_name, website, city, contact_id) VALUES ('Studny Novák', $1, 'Třebíč', $2)`, [
    website,
    contactId,
  ])
}

const researchRows = async () =>
  (await db.query<{ id: string; status: string; brief: Record<string, unknown>; contact_id: string | null }>(
    `SELECT id::text, status, brief, contact_id::text FROM offer_research ORDER BY created_at`,
  )).rows

describe('automatický rozbor a schůzky proti Postgresu (migrace 136–139)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    for (const file of ['136_navrhovac_rozbor.sql', '137_navrhovac_fronta.sql', '138_zakaziq_voice.sql', '139_voice_schuzky.sql']) {
      const sql = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
      await db.exec(sql)
      await db.exec(sql)
    }
    setAdminDbForTests(pgliteAdminDriver(db))
  })
  afterAll(async () => {
    setAdminDbForTests(null)
    vi.unstubAllEnvs()
    await db.close()
  })
  beforeEach(async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('OFFER_RESEARCH_API_KEY', KEY)
    notifications.length = 0
    started.length = 0
    await db.exec(`DELETE FROM voice_meeting_turns; DELETE FROM voice_meetings; DELETE FROM offer_research;
                   DELETE FROM outreach_leads; DELETE FROM projects; DELETE FROM contacts;`)
  })

  it('bez propojené úlohy se nic nespouští ani nehlásí', async () => {
    vi.stubEnv('OFFER_RESEARCH_API_KEY', '')
    const id = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    await firmFor(id)
    expect(await autoStartResearch({ contactId: id, trigger: 'outreach' }, fire)).toBe('not_connected')
    expect(await researchRows()).toHaveLength(0)
    expect(notifications).toHaveLength(0)
  })

  it('firma od asistenta: rozbor se spustí sám i bez webu a nese značku', async () => {
    const id = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    await firmFor(id)
    expect(await autoStartResearch({ contactId: id, trigger: 'outreach' }, fire)).toBe('started')
    const [row] = await researchRows()
    expect(row.brief.trigger).toBe('outreach')
    expect(row.brief.company).toBe('Studny Novák')
    expect(started).toEqual([row.id])
    // Úloha značku nevidí.
    const claimed = await claimResearch(row.id)
    expect(claimed?.zadani).not.toHaveProperty('trigger')
  })

  it('jeden kontakt dostane automatický rozbor jen jednou, i přes sloučení', async () => {
    const root = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    await firmFor(root)
    await autoResearchAfterConsent([root, root], fire)
    expect(await researchRows()).toHaveLength(1)
    const child = await contact({ name: 'Jan N.', company: 'Studny Novák' })
    await db.query(`UPDATE contacts SET merged_into = $1 WHERE id = $2`, [root, child])
    expect(await autoStartResearch({ contactId: child, trigger: 'outreach' }, fire)).toBe('already')
    expect(await researchRows()).toHaveLength(1)
    expect(notifications).toHaveLength(0)
  })

  it('kontakt bez webu a IČO z poptávky: rozbor se nespustí a přijde upozornění', async () => {
    const id = await contact({ name: 'Petra Malá', email: 'petra@gmail.com' })
    expect(await autoStartResearch({ contactId: id, trigger: 'web_lead' }, fire)).toBe('nothing_to_search')
    expect(await researchRows()).toHaveLength(0)
    expect(notifications).toEqual([
      expect.objectContaining({ type: 'offer_research_skipped', link: `/dashboard/kontakty/${id}` }),
    ])
    expect(notifications[0].body).toContain('web i IČO')
  })

  it('automatika má vlastní denní strop a dá vědět', async () => {
    for (let i = 0; i < AUTO_DAILY_LIMIT; i++) {
      const other = await contact({ name: `Firma ${i}`, company: `Firma ${i}` })
      await db.query(
        `INSERT INTO offer_research (contact_id, status, error, brief) VALUES ($1, 'failed', 'gave_up', '{"company":"X","trigger":"outreach"}'::jsonb)`,
        [other],
      )
    }
    const id = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    await firmFor(id)
    expect(await autoStartResearch({ contactId: id, trigger: 'outreach' }, fire)).toBe('daily_limit')
    expect(notifications.map((n) => n.type)).toEqual(['offer_research_skipped'])
    expect(started).toHaveLength(0)
  })

  it('poptávka z webu s webem firmy: založí kontakt, napojí poptávku a hledá podle domény', async () => {
    const project = (await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Petra Malá') RETURNING id::text`)).rows[0].id
    const out = await researchAfterWebLead(
      { projectId: project, name: 'Petra Malá', email: 'petra@gmail.com', phone: '+420 777 111 222', companyUrl: 'https://www.kadernictvi-mala.cz/' },
      fire,
    )
    expect(out).toBe('started')
    const c = (await db.query<{ id: string; source: string }>(`SELECT id::text, source FROM contacts`)).rows
    expect(c).toHaveLength(1)
    expect(c[0].source).toBe('web')
    const p = (await db.query<{ contact_id: string }>(`SELECT contact_id::text FROM projects WHERE id = $1`, [project])).rows[0]
    expect(p.contact_id).toBe(c[0].id)
    const [row] = await researchRows()
    expect(row.brief).toMatchObject({ trigger: 'web_lead', company: 'kadernictvi-mala.cz', person: 'Petra Malá' })
    expect(row.brief.web).toMatch(/^https:\/\/www\.kadernictvi-mala\.cz/)
  })

  it('poptávka z webu cizímu kontaktu nic nedoplní (telefon klienta + cizí e-mail)', async () => {
    const client = (
      await db.query<{ id: string }>(
        `INSERT INTO contacts (display_name, company, phone) VALUES ('Jan Novák', 'Studny Novák', '+420777111222') RETURNING id::text`,
      )
    ).rows[0].id
    const project = (await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Útočník') RETURNING id::text`)).rows[0].id
    await researchAfterWebLead(
      { projectId: project, name: 'Útočník', email: 'utocnik@zlafirma.cz', phone: '+420 777 111 222', companyUrl: null },
      fire,
    )
    const c = (await db.query<{ email: string | null }>(`SELECT email FROM contacts WHERE id = $1`, [client])).rows[0]
    expect(c.email).toBeNull()
  })

  it('poptávka z webu bez webu firmy: žádný kontakt, žádný rozbor', async () => {
    const project = (await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Petra') RETURNING id::text`)).rows[0].id
    const out = await researchAfterWebLead({ projectId: project, name: 'Petra', email: 'petra@seznam.cz', phone: null }, fire)
    expect(out).toBe('nothing_to_search')
    expect((await db.query(`SELECT 1 FROM contacts`)).rows).toHaveLength(0)
    expect(await researchRows()).toHaveLength(0)
  })

  it('poptávka z firemního e-mailu: web se odvodí z domény', async () => {
    const project = (await db.query<{ id: string }>(`INSERT INTO projects (client_name) VALUES ('Karel') RETURNING id::text`)).rows[0].id
    expect(await researchAfterWebLead({ projectId: project, name: 'Karel', email: 'karel@truhlarstvi-k.cz', phone: null }, fire)).toBe('started')
    const [row] = await researchRows()
    expect(row.brief).toMatchObject({ web: 'https://truhlarstvi-k.cz/', company: 'truhlarstvi-k.cz' })
  })

  it('úloha rozbor vzdá → upozornění s odkazem na kontakt', async () => {
    const id = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    await firmFor(id)
    await autoStartResearch({ contactId: id, trigger: 'outreach' }, fire)
    const claimed = await claimResearch(null)
    expect(await failResearch(claimed!.id)).toEqual({ ok: true })
    expect(notifications).toEqual([
      expect.objectContaining({ type: 'offer_research_failed', title: 'Rozbor firmy se nepovedl: Studny Novák', link: `/dashboard/kontakty/${id}` }),
    ])
    expect(notifications[0].body).toContain('nic spolehlivého')
  })

  it('zaseknutý rozbor ukončí údržba a dá vědět', async () => {
    const id = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    await firmFor(id)
    await autoStartResearch({ contactId: id, trigger: 'outreach' }, fire)
    await claimResearch(null)
    await db.query(`UPDATE offer_research SET claimed_at = now() - interval '2 hours'`)
    expect((await maintainOfferResearch()).timedOut).toBe(1)
    expect(notifications).toEqual([expect.objectContaining({ type: 'offer_research_failed' })])
    expect(notifications[0].body).toContain('nedoběhl')
  })

  it('poslední hotová schůzka s kontaktem (i sloučeným) se shrnutím', async () => {
    const root = await contact({ name: 'Jan Novák', company: 'Studny Novák' })
    const child = await contact({ name: 'Jan N.' })
    await db.query(`UPDATE contacts SET merged_into = $1 WHERE id = $2`, [root, child])
    expect(await latestMeetingForContact(root)).toBeNull()

    const summary = { summary: 'Klient chce nový web se ceníkem.', agreements: ['Pošlu nabídku do pátku.'] }
    await db.query(
      `INSERT INTO voice_meetings (id, started_at, status, contact_id, title, summary)
       VALUES (gen_random_uuid(), now() - interval '3 days', 'done', $1, 'Starší', NULL),
              (gen_random_uuid(), now() - interval '1 day', 'done', $1, 'Web pro studny', $2::jsonb),
              (gen_random_uuid(), now(), 'recording', $1, 'Probíhá', NULL)`,
      [child, JSON.stringify(summary)],
    )
    await db.query(
      `INSERT INTO voice_meeting_turns (meeting_id, track, idx, start_ms, duration_ms, status, text)
       SELECT id, 'other', 0, 0, 1000, 'ok', 'Jedna studna u nás stojí tak sedmdesát tisíc.' FROM voice_meetings`,
    )
    const m = await latestMeetingForContact(root)
    expect(m).toMatchObject({ title: 'Web pro studny', summary: 'Klient chce nový web se ceníkem.', agreements: ['Pošlu nabídku do pátku.'] })
  })
})

describe('kontrola návrhů ze schůzky', () => {
  const transcript = [
    '[0:12] Kryštof: Kolik stojí jedna zakázka?',
    '[0:20] Jan Novák: No, jedna studna u nás vyjde tak na sedmdesát tisíc, někdy 80 tisíc.',
    '[1:02] Jan Novák: A chtěli bychom i německou verzi, máme zákazníky z Rakouska.',
    '[1:40] Jan Novák: Potřebuju to mít hotové do března, to je pro nás klíčové.',
    '[2:10] Jan Novák: E-shop nepotřebujeme, jen ať tam lidi najdou ceník a napíšou.',
    '[2:40] Jan Novák: Za web bych dal maximálně třicet tisíc.',
  ].join('\n\n')

  it('citace musí v přepisu opravdu být (interpunkce a velká písmena nevadí)', () => {
    const folded = foldForQuote(transcript)
    expect(quoteInTranscript('jedna studna u nás vyjde tak na sedmdesát tisíc', folded)).toBe(true)
    expect(quoteInTranscript('Jedna studna u nás vyjde, tak na sedmdesát tisíc!', folded)).toBe(true)
    expect(quoteInTranscript('jedna studna u nás vyjde na sto tisíc', folded)).toBe(false)
    expect(quoteInTranscript('tak', folded)).toBe(false)
  })

  it('částka musí v citaci zaznít', () => {
    expect(quoteHasAmount('vyjde tak na sedmdesát tisíc', 70_000)).toBe(true)
    expect(quoteHasAmount('někdy 80 tisíc', 80_000)).toBe(true)
    expect(quoteHasAmount('stojí 65 000 Kč', 65_000)).toBe(true)
    expect(quoteHasAmount('vyjde tak na sedmdesát tisíc', 60_000)).toBe(false)
  })

  it('pustí jen prověřené návrhy, každé pole jednou', () => {
    const hints = checkHints(
      [
        { field: 'typical_job', value: '70000', quote: 'jedna studna u nás vyjde tak na sedmdesát tisíc' },
        { field: 'typical_job', value: '80000', quote: 'někdy 80 tisíc' },
        { field: 'languages', value: '1', quote: 'chtěli bychom i německou verzi' },
        { field: 'rush', value: 'ano', quote: 'Potřebuju to mít hotové do března' },
        { field: 'kind', value: 'web', quote: 'E-shop nepotřebujeme' },
        { field: 'budget', value: 'maximálně 30 tisíc', quote: 'Za web bych dal maximálně třicet tisíc' },
      ],
      transcript,
    )
    expect(hints).toEqual([
      { field: 'typical_job', czk: 70_000, quote: 'jedna studna u nás vyjde tak na sedmdesát tisíc' },
      { field: 'languages', extra: 1, quote: 'chtěli bychom i německou verzi' },
      { field: 'rush', quote: 'Potřebuju to mít hotové do března' },
      { field: 'kind', kind: 'web', quote: 'E-shop nepotřebujeme' },
      { field: 'budget', text: 'maximálně 30 tisíc', quote: 'Za web bych dal maximálně třicet tisíc' },
    ])
  })

  it('vymyšlená citace, číslo mimo citaci a nesmyslné hodnoty zmizí', () => {
    const hints = checkHints(
      [
        { field: 'typical_job', value: '150000', quote: 'jedna studna stojí sto padesát tisíc' },
        { field: 'typical_job', value: '90000', quote: 'vyjde tak na sedmdesát tisíc' },
        { field: 'languages', value: '7', quote: 'chtěli bychom i německou verzi' },
        { field: 'rush', value: 'ne', quote: 'Potřebuju to mít hotové do března' },
        { field: 'kind', value: 'katalog', quote: 'E-shop nepotřebujeme' },
      ],
      transcript,
    )
    expect(hints).toEqual([])
  })

  it('bez klíče k modelu se přepis nikam neposílá', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(await extractMeetingHints(transcript)).toEqual({ ok: false, code: 'NOT_CONFIGURED' })
    vi.unstubAllEnvs()
  })
})

describe('čím se automatika řídí', () => {
  it('poptávka z webu bez webu a IČO není podle čeho hledat, firma od asistenta ano', () => {
    expect(hasSomethingToSearch({ web: null, ico: null }, 'web_lead')).toBe(false)
    expect(hasSomethingToSearch({ web: null, ico: '12345678' }, 'web_lead')).toBe(true)
    expect(hasSomethingToSearch({ web: 'https://a.cz', ico: null }, 'web_lead')).toBe(true)
    expect(hasSomethingToSearch({ web: null, ico: null }, 'outreach')).toBe(true)
  })

  it('web z formuláře, jinak z firemního e-mailu; doména jako název', () => {
    expect(webLeadSite('https://www.studny.cz/kontakt', 'a@gmail.com')).toMatch(/^https:\/\/www\.studny\.cz/)
    expect(webLeadSite('javascript:alert(1)', 'jan@studny.cz')).toBe('https://studny.cz')
    expect(webLeadSite(null, 'jan@seznam.cz')).toBeNull()
    expect(webLabel('https://www.studny.cz/kontakt')).toBe('studny.cz')
    expect(webLabel(null)).toBeNull()
  })

  it('věta do upozornění o poptávce jen bez webu a jen s propojenou úlohou', () => {
    vi.stubEnv('OFFER_RESEARCH_API_KEY', KEY)
    expect(webLeadResearchNote(null, 'jan@seznam.cz')).toBe(WEB_LEAD_NOTHING_TO_SEARCH)
    expect(webLeadResearchNote('https://studny.cz', 'jan@seznam.cz')).toBeNull()
    vi.stubEnv('OFFER_RESEARCH_API_KEY', '')
    expect(webLeadResearchNote(null, 'jan@seznam.cz')).toBeNull()
    vi.unstubAllEnvs()
  })
})
