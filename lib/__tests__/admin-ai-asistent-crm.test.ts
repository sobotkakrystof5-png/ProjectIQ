import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { NextRequest } from 'next/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AI asistent jako CRM (R-120) proti skutečnému Postgresu (PGlite) se SQL
 * z migrací 114, 116 a 119.
 *
 * Co se hlídá:
 * - snímek v2 uloží firmu, všechny hovory a e-maily; migrace jde pustit dvakrát,
 * - chybějící údaj nic nepřepíše (přepis, cena), výsledek hovoru ano,
 * - starší snímek nevrátí hovoru starý výsledek,
 * - snímek v1 nesmaže údaje v2,
 * - bez migrace 119 se snímek v2 uloží jako v1 a hovory bez údajů v2,
 * - zpětný kanál vrátí jen to, co změnil Kryštof, a umí `since`,
 * - filtry, hledání podle telefonu a Přehled počítají správně,
 * - náhled ukázky jde jen přihlášenému a jen z navrhy.vizeon.cz.
 */

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
// Omezení počtu požadavků (lib/api-rate-limit) čte přes lib/db: nikdy nepřekročeno.
vi.mock('@/lib/db', () => ({ sql: async () => [{ count: 0 }] }))

let session: { email: string } | null = { email: 'admin@example.cz' }
vi.mock('@/lib/auth', () => ({
  getAdminSession: async () => session,
  adminActorEmail: async () => 'admin@example.cz',
  requireAuth: async () => undefined,
}))

const ROOT = path.resolve(__dirname, '../..')
const migration = (name: string) => fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8')

import { setAdminDbForTests } from '@/lib/admin/db'
import { ingestOutreachLeads, loadHandledChanges, markOutreachHandled, restoreOutreachLead } from '@/lib/admin/outreach'
import { ingestOutreachReport } from '@/lib/admin/outreach-reports'
import { loadContact, loadContacts, loadOverview } from '@/lib/admin/outreach-crm'
import { buildTimeline, searchPattern, syncIsStale } from '@/lib/admin/outreach-crm-view'
import { adminDemoHref, isAllowedDemoAsset } from '@/lib/admin/outreach-demo'
import { outreachPayloadSchema, type OutreachPayload } from '@/types/outreach'
import { reportPayloadSchema } from '@/types/outreach-report'
import { GET as handledGET } from '@/app/api/public/outreach/handled/route'
import { GET as previewGET } from '@/app/api/outreach/leads/[id]/nahled/route'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const SCHEMA = `
CREATE TABLE client_leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL);
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at timestamptz NOT NULL,
  meet_url text, invite_status text,
  outreach_lead_id uuid
);
`

let db: PGlite

function payload(lead: Record<string, unknown>, version = 2): OutreachPayload {
  return outreachPayloadSchema.parse({
    version,
    leads: [
      {
        external_id: 'vizeon-outreach:7',
        updated_at: '2026-11-17T10:00:00Z',
        company: 'Podlahy Testové',
        contact_name: 'Petr Test',
        phone: '+420777000777',
        email: 'petr@example.cz',
        status: 'email_sent',
        attempts: 2,
        ...lead,
      },
    ],
  })
}

const CALL_1 = {
  external_id: 'vizeon-call:71',
  at: '2026-11-16T09:00:00Z',
  result: 'nezvedl',
}
const CALL_2 = {
  external_id: 'vizeon-call:72',
  at: '2026-11-17T08:30:00Z',
  result: 'SOUHLAS',
  duration_s: 84,
  summary: 'Chce ukázku, nový web potřebuje.',
  conversation_id: 'conv_abc123',
  cost_czk: 2.4,
  cost_source: 'odorik',
  telephony_status: 'answered',
  collected: { chce_ukazku: 'true', termin_text: 've čtvrtek odpoledne' },
  criteria: [{ id: 'ai_disclosure', name: 'AI hned po pozdravu', result: 'success' }],
  transcript: [
    { role: 'agent', t: 0, text: 'Dobrý den, jsem AI asistent.' },
    { role: 'user', t: 2, text: 'Dobrý den.' },
  ],
}
const EMAIL = {
  external_id: 'vizeon-email:9',
  kind: 'demo',
  status: 'sent',
  subject: 'Návrh nového webu pro Podlahy Testové',
  text: 'Dobrý den, posílám ukázku.',
  sent_at: '2026-11-17T12:00:00Z',
  opened_at: '2026-11-17T13:00:00Z',
  opens: 2,
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  for (const m of ['114_hovory_od_asistenta.sql', '116_ai_asistent_reporty.sql', '119_ai_asistent_crm.sql']) {
    await db.exec(migration(m))
  }
  // Idempotence: 119 podruhé musí projít beze změny.
  await db.exec(migration('119_ai_asistent_crm.sql'))
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  session = { email: 'admin@example.cz' }
  await db.exec('DELETE FROM outreach_leads; DELETE FROM outreach_calls; DELETE FROM outreach_emails; DELETE FROM calendar_events;')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('snímek v2', () => {
  it('uloží firmu, všechny hovory, e-maily, historii a rešerši', async () => {
    const p = payload({
      demo: { url: 'https://navrhy.vizeon.cz/podlahy-testove/', status: 'ready', slug: 'podlahy-testove', preview_url: 'https://navrhy.vizeon.cz/podlahy-testove/nahled.png' },
      emails: { demo_sent_at: '2026-11-17T12:00:00Z' },
      calls: [CALL_1, CALL_2],
      email_log: [EMAIL],
      status_history: [{ at: '2026-11-17T08:31:00Z', status: 'accepted' }],
      research: { angle: 'penize', hook: 'Web nefunguje na telefonu.', findings: ['Chybí kontakt'] },
    })
    const result = await ingestOutreachLeads(p.leads, p.version)
    expect(result).toMatchObject({ saved: 1, calls: 2, emails: 1 })

    const id = (await db.query<{ id: string }>('SELECT id FROM outreach_leads')).rows[0].id
    const screen = await loadContact(id)
    expect(screen).not.toBeNull()
    expect(screen!.calls.map((c) => c.id)).toEqual(['vizeon-call:72', 'vizeon-call:71'])
    expect(screen!.calls[0]).toMatchObject({
      conversationId: 'conv_abc123',
      costCzk: 2.4,
      collected: { chce_ukazku: 'true', termin_text: 've čtvrtek odpoledne' },
      date: '2026-11-17',
    })
    expect(screen!.emails[0]).toMatchObject({ subject: EMAIL.subject, openCount: 2, bodyText: EMAIL.text })
    expect(screen!.lead).toMatchObject({ demoSlug: 'podlahy-testove', snapshotVersion: 2 })
    expect(screen!.lead.research?.findings).toEqual(['Chybí kontakt'])

    const timeline = buildTimeline(screen!.lead, screen!.calls, screen!.emails, new Date('2026-11-18T08:00:00Z'))
    expect(timeline[0].title).toBe('Otevřel e-mail s ukázkou')
    expect(timeline.map((t) => t.title)).toContain('Hovor: chce ukázku')
  })

  it('chybějící přepis ani cena nic nesmažou, výsledek se ale aktualizuje', async () => {
    await ingestOutreachLeads(payload({ calls: [CALL_2] }).leads, 2)
    // Hodinová synchronizace: stejný hovor bez přepisu a ceny.
    await ingestOutreachLeads(
      payload({
        updated_at: '2026-11-17T11:00:00Z',
        calls: [{ external_id: CALL_2.external_id, at: CALL_2.at, result: 'zavolat jindy' }],
      }).leads,
      2,
    )
    const row = (
      await db.query<{ result: string; transcript: unknown; cost_czk: string; summary: string }>(
        `SELECT result, transcript, cost_czk, summary FROM outreach_calls WHERE external_id = 'vizeon-call:72'`,
      )
    ).rows[0]
    expect(row.result).toBe('zavolat jindy')
    expect(row.transcript).not.toBeNull()
    expect(Number(row.cost_czk)).toBe(2.4)
    expect(row.summary).toBe(CALL_2.summary)
  })

  it('report po kole přepis ze snímku nesmaže a cenu nechá', async () => {
    await ingestOutreachLeads(payload({ calls: [CALL_2] }).leads, 2)
    await ingestOutreachReport(
      reportPayloadSchema.parse({
        version: 1,
        report: { date: '2026-11-17', generated_at: '2026-11-17T17:00:00Z', subject: 'Hovory', stats: { calls: 1 } },
        calls: [{ external_id: 'vizeon-call:72', lead_external_id: 'vizeon-outreach:7', company: 'Podlahy Testové', result: 'SOUHLAS' }],
      }),
    )
    const row = (await db.query<{ transcript: unknown; cost_czk: string }>(`SELECT transcript, cost_czk FROM outreach_calls`)).rows[0]
    expect(row.transcript).not.toBeNull()
    expect(Number(row.cost_czk)).toBe(2.4)
  })

  it('starší snímek nevrátí hovoru starý výsledek', async () => {
    await ingestOutreachLeads(payload({ updated_at: '2026-11-17T12:00:00Z', calls: [CALL_2] }).leads, 2)
    const stale = await ingestOutreachLeads(
      payload({ updated_at: '2026-11-17T09:00:00Z', calls: [{ ...CALL_2, result: 'čeká' }] }).leads,
      2,
    )
    expect(stale.saved).toBe(0)
    const row = (await db.query<{ result: string }>(`SELECT result FROM outreach_calls`)).rows[0]
    expect(row.result).toBe('SOUHLAS')
  })

  it('snímek v1 nesmaže údaje v2', async () => {
    await ingestOutreachLeads(payload({ demo: { url: 'https://navrhy.vizeon.cz/a/', slug: 'a' }, segment: 'remeslnik' }).leads, 2)
    await ingestOutreachLeads(payload({ updated_at: '2026-11-17T11:00:00Z', demo: { url: 'https://navrhy.vizeon.cz/a/' } }, 1).leads, 1)
    const row = (await db.query<{ demo_slug: string; segment: string; snapshot_version: number }>(
      'SELECT demo_slug, segment, snapshot_version FROM outreach_leads',
    )).rows[0]
    expect(row).toMatchObject({ demo_slug: 'a', segment: 'remeslnik', snapshot_version: 1 })
  })
})

describe('zpětný kanál pro Growth OS', () => {
  it('vrátí jen změny od Kryštofa a umí since', async () => {
    await ingestOutreachLeads(payload({}).leads, 2)
    const before = new Date(Date.now() - 1000)
    // Snímek sám nic do zpětného kanálu nedává.
    expect(await loadHandledChanges(before)).toEqual([])

    const id = (await db.query<{ id: string }>('SELECT id FROM outreach_leads')).rows[0].id
    await markOutreachHandled(id, 'nezajem', null)
    await db.query(`INSERT INTO calendar_events (starts_at, outreach_lead_id) VALUES (now() + interval '2 days', $1)`, [id])

    const changes = await loadHandledChanges(before)
    expect(changes).toHaveLength(1)
    expect(changes![0]).toMatchObject({ external_id: 'vizeon-outreach:7', handled: 'nezajem' })
    expect(changes![0].meeting_at).not.toBeNull()

    // Další snímek „vyřízeno" nezmění, takže ani datum změny.
    await ingestOutreachLeads(payload({ updated_at: '2026-11-17T11:00:00Z' }).leads, 2)
    expect(await loadHandledChanges(new Date(changes![0].changed_at))).toEqual([])

    await restoreOutreachLead(id)
    const restored = await loadHandledChanges(new Date(changes![0].changed_at))
    expect(restored?.[0]).toMatchObject({ handled: null })
  })

  it('endpoint chce klíč a validuje since', async () => {
    vi.stubEnv('GROWTH_OS_API_KEY', 'tajny-klic-pro-test')
    const url = 'https://www.zakaziq.cz/api/public/outreach/handled'
    expect((await handledGET(new NextRequest(url))).status).toBe(401)
    const auth = { headers: { authorization: 'Bearer tajny-klic-pro-test' } }
    expect((await handledGET(new NextRequest(`${url}?since=nesmysl`, auth))).status).toBe(400)
    const ok = await handledGET(new NextRequest(`${url}?since=2026-01-01T00:00:00Z`, auth))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ success: true, leads: [], has_more: false })
  })
})

describe('Kontakty a Přehled', () => {
  it('filtry, počty a hledání podle telefonu zapsaného jinak', async () => {
    await ingestOutreachLeads(
      outreachPayloadSchema.parse({
        version: 2,
        leads: [
          { external_id: 'a', updated_at: '2026-11-17T10:00:00Z', company: 'Alfa', status: 'accepted', attempts: 1, phone: '+420777111222' },
          {
            external_id: 'b',
            updated_at: '2026-11-17T10:00:00Z',
            company: 'Beta',
            status: 'email_sent',
            attempts: 1,
            demo: { url: 'https://navrhy.vizeon.cz/b/', views: 2 },
            emails: { demo_sent_at: '2026-11-17T09:00:00Z' },
          },
          { external_id: 'c', updated_at: '2026-11-17T10:00:00Z', company: 'Gama', status: 'declined', attempts: 1 },
        ],
      }).leads,
      2,
    )
    const all = await loadContacts('vse', undefined)
    expect(all.counts).toMatchObject({ vse: 3, 'na-tahu': 2, ukazka: 1, otevreli: 1, vyrizene: 1 })
    expect((await loadContacts('otevreli', undefined)).rows.map((r) => r.company)).toEqual(['Beta'])
    expect((await loadContacts('vse', '777 111')).rows.map((r) => r.company)).toEqual(['Alfa'])
    // Zástupné znaky z hledání se berou doslova.
    expect((await loadContacts('vse', '%')).rows).toEqual([])
    expect((await loadContacts('na-tahu', undefined)).queue?.length).toBe(2)

    // Schůzka zapsaná v adminu („Schůzka domluvena") se v seznamu ukáže.
    const beta = (await db.query<{ id: string }>(`SELECT id FROM outreach_leads WHERE company_name = 'Beta'`)).rows[0].id
    const at = new Date(Date.now() + 2 * 86_400_000)
    at.setUTCSeconds(0, 0)
    await db.query(`INSERT INTO calendar_events (starts_at, outreach_lead_id) VALUES ($1, $2)`, [at.toISOString(), beta])
    expect((await loadContacts('otevreli', undefined)).rows[0].meetingAt).toBe(at.toISOString())
  })

  it('Přehled počítá dnešek a odkazuje poslední hovor na klienta', async () => {
    const at = new Date().toISOString()
    await ingestOutreachLeads(
      payload({ updated_at: at, calls: [{ ...CALL_2, at }, { ...CALL_1, external_id: 'vizeon-call:73', at }] }).leads,
      2,
    )
    const o = await loadOverview()
    expect(o.available).toBe(true)
    expect(o.today).toMatchObject({ calls: 2, connected: 1, accepted: 1, costCzk: 2.4 })
    expect(o.recentCalls[0].leadId).not.toBeNull()
    expect(o.funnel.dialed).toBe(1)
  })
})

describe('náhled ukázky', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('náhled: jen navrhy.vizeon.cz a jen obrázek', async () => {
    await ingestOutreachLeads(
      payload({ demo: { url: 'https://navrhy.vizeon.cz/p/', preview_url: 'https://navrhy.vizeon.cz/p/nahled.png' } }).leads,
      2,
    )
    const id = (await db.query<{ id: string }>('SELECT id FROM outreach_leads')).rows[0].id
    const req = new Request(`https://www.zakaziq.cz/api/outreach/leads/${id}/nahled`)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png' } })))
    const ok = await previewGET(req, ctx(id))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<script>', { headers: { 'content-type': 'text/html' } })))
    expect((await previewGET(req, ctx(id))).status).toBe(502)

    // Přes 2 MB bez content-length: čtení se utne, do paměti se celé nenačte.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(3 * 1024 * 1024), { headers: { 'content-type': 'image/png' } })))
    expect((await previewGET(req, ctx(id))).status).toBe(502)

    // Cizí adresa se ani nezkusí stáhnout.
    await db.query(`UPDATE outreach_leads SET demo_preview_url = 'https://evil.example/x.png'`)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await previewGET(req, ctx(id))).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('čisté funkce', () => {
  it('povolené adresy náhledu', () => {
    expect(isAllowedDemoAsset('https://navrhy.vizeon.cz/a/nahled.png')).toBe(true)
    expect(isAllowedDemoAsset('http://navrhy.vizeon.cz/a.png')).toBe(false)
    expect(isAllowedDemoAsset('https://navrhy.vizeon.cz.evil.example/a.png')).toBe(false)
    expect(isAllowedDemoAsset('https://user@navrhy.vizeon.cz/a.png')).toBe(false)
    expect(isAllowedDemoAsset('https://navrhy.vizeon.cz:8443/a.png')).toBe(false)
    expect(adminDemoHref('https://navrhy.vizeon.cz/a/')).toBe('https://navrhy.vizeon.cz/a/?od=admin')
    expect(adminDemoHref('https://navrhy.vizeon.cz/a/?x=1')).toBe('https://navrhy.vizeon.cz/a/?x=1&od=admin')
  })

  it('hledání a stáří dat', () => {
    expect(searchPattern('  ')).toBeNull()
    expect(searchPattern('50%_x')).toEqual({ like: '%50\\%\\_x%', digits: null })
    expect(searchPattern('+420 777')?.digits).toBe('420777')
    // Úterý 10:00 v Praze: 4 h bez dat je moc, 1 h je v pořádku.
    const tue = new Date('2026-11-17T09:00:00Z')
    expect(syncIsStale('2026-11-17T05:00:00Z', tue)).toBe(true)
    expect(syncIsStale('2026-11-17T08:00:00Z', tue)).toBe(false)
    // Neděle: data z pátku stačí.
    expect(syncIsStale('2026-11-13T17:00:00Z', new Date('2026-11-15T12:00:00Z'))).toBe(false)
  })
})

describe('bez migrace 119', () => {
  it('snímek v2 se uloží jako v1, hovory bez údajů v2', async () => {
    const old = new PGlite()
    await old.exec(SCHEMA)
    await old.exec(migration('114_hovory_od_asistenta.sql'))
    await old.exec(migration('116_ai_asistent_reporty.sql'))
    setAdminDbForTests(pgliteAdminDriver(old))
    try {
      const p = payload({ calls: [CALL_2], email_log: [EMAIL], segment: 'remeslnik' })
      const result = await ingestOutreachLeads(p.leads, 2)
      expect(result).toMatchObject({ saved: 1, calls: 1, emails: 0 })
      const id = (await old.query<{ id: string }>('SELECT id FROM outreach_leads')).rows[0].id
      const screen = await loadContact(id)
      expect(screen?.calls[0]).toMatchObject({ summary: CALL_2.summary, conversationId: null })
      expect(await loadHandledChanges(new Date(0))).toBeNull()
      expect((await loadContacts('vse', undefined)).counts.vse).toBe(1)
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
      await old.close()
    }
  })
})
