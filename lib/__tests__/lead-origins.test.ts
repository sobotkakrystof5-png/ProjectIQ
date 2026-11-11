import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { LEAD_ORIGIN_KEYS, WEB_LEAD_ORIGINS, toLeadOrigin, bookingRateLimitKey, leadRateLimitKey } from '@/lib/lead-origins'
import { resolveLegacyRedirect } from '@/lib/legacy-redirects.mjs'

// Jeden byznys, tři zdroje poptávek (AD02, R-088, migrace 102).
//
// Test staví minimální `projects` a `calendar_events` tak, jak je nechaly
// migrace 050 a 048 (sloupec `business`, dvojice potvrzovacích příznaků),
// a pak na ně pustí 102 dvakrát — ověřuje přejmenování, backfill, trigger
// i generovaný sloupec `lead_pending`.

const ROOT = path.resolve(__dirname, '../..')
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

let db: PGlite
const one = async <T extends Record<string, unknown>>(sqlText: string, params: unknown[] = []) =>
  (await db.query<T>(sqlText, params)).rows[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      status text DEFAULT 'new',
      source text DEFAULT 'manual',
      vizeon_confirmed boolean DEFAULT false,
      alteno_confirmed boolean DEFAULT false,
      business text NOT NULL DEFAULT 'vizeon',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz
    );
    CREATE INDEX idx_projects_business ON projects (business);
    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      business text NOT NULL DEFAULT 'vizeon'
    );
    CREATE INDEX idx_calendar_events_business ON calendar_events (business);
    CREATE TABLE agent_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id text UNIQUE,
      business text DEFAULT 'vizeon'
    );
  `)

  // Historie: potvrzená poptávka z každé sekce, nepotvrzená poptávka,
  // ruční zakázka a řádek s hodnotou `source`, o které CHECK neví.
  await db.exec(`
    INSERT INTO projects (client_name, source, vizeon_confirmed, alteno_confirmed, business) VALUES
      ('Potvrzená VIZEON', 'vizeon_web', true,  false, 'vizeon'),
      ('Potvrzená ALTENO', 'alteno_web', false, true,  'alteno'),
      ('Čekající VIZEON', 'vizeon_web', false, false, 'vizeon'),
      ('Ruční zakázka',   'manual',     false, false, 'alteno'),
      ('Historický zdroj','web',        false, false, 'vizeon')
  `)

  // Idempotence: dvakrát za sebou nesmí spadnout ani nic změnit.
  await db.exec(read('migrations', '102_jeden_inbox_poptavek.sql'))
  await db.exec(read('migrations', '102_jeden_inbox_poptavek.sql'))
})

describe('migrace 102 — jeden inbox poptávek', () => {
  it('business se přejmenoval na lead_origin ve všech třech tabulkách i v indexech', async () => {
    const cols = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'lead_origin' ORDER BY table_name`,
    )
    expect(cols.rows.map((r) => r.table_name)).toEqual(['agent_leads', 'calendar_events', 'projects'])

    const old = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'business'`,
    )
    expect(old.rows).toHaveLength(0)

    const idx = await db.query<{ relname: string }>(
      `SELECT relname FROM pg_class WHERE relname LIKE 'idx_%lead_origin' ORDER BY relname`,
    )
    expect(idx.rows.map((r) => r.relname)).toEqual(['idx_calendar_events_lead_origin', 'idx_projects_lead_origin'])
  })

  it('backfill slil dvojici příznaků do lead_confirmed a historii nechal bez data potvrzení', async () => {
    const rows = await db.query<{ client_name: string; lead_confirmed: boolean; lead_confirmed_at: string | null }>(
      'SELECT client_name, lead_confirmed, lead_confirmed_at FROM projects ORDER BY client_name',
    )
    const by = Object.fromEntries(rows.rows.map((r) => [r.client_name, r]))
    expect(by['Potvrzená VIZEON'].lead_confirmed).toBe(true)
    expect(by['Potvrzená ALTENO'].lead_confirmed).toBe(true)
    expect(by['Čekající VIZEON'].lead_confirmed).toBe(false)
    // Datum potvrzení historie neznáme — trigger si ho nesmí vymyslet.
    expect(by['Potvrzená VIZEON'].lead_confirmed_at).toBeNull()
    expect(by['Potvrzená ALTENO'].lead_confirmed_at).toBeNull()
  })

  it('lead_pending čeká jen na nepotvrzenou poptávku z webu, ne na ruční zakázku', async () => {
    const rows = await db.query<{ client_name: string }>(
      'SELECT client_name FROM projects WHERE lead_pending ORDER BY client_name',
    )
    // `Historický zdroj` má source 'web' — po sloučení je to taky nepotvrzená
    // poptávka. Je to záměr: `lead_pending` je jediné pravidlo pro inbox.
    expect(rows.rows.map((r) => r.client_name)).toEqual(['Historický zdroj', 'Čekající VIZEON'])
  })

  it('potvrzení zapíše čas a udrží staré příznaky pravdivé', async () => {
    await db.exec("UPDATE projects SET lead_confirmed = true WHERE client_name = 'Čekající VIZEON'")
    const row = await one<{ lead_pending: boolean; lead_confirmed_at: string | null; vizeon_confirmed: boolean; alteno_confirmed: boolean }>(
      'SELECT lead_pending, lead_confirmed_at, vizeon_confirmed, alteno_confirmed FROM projects WHERE client_name = $1',
      ['Čekající VIZEON'],
    )
    expect(row.lead_pending).toBe(false)
    expect(row.lead_confirmed_at).not.toBeNull()
    expect(row.vizeon_confirmed).toBe(true)
    expect(row.alteno_confirmed).toBe(true)
  })

  it('do lead_pending se nedá zapsat', async () => {
    await expect(
      db.exec("INSERT INTO projects (client_name, lead_pending) VALUES ('Pokus', true)"),
    ).rejects.toThrow()
  })

  it('neznámý zdroj nebo stav nová data nepustí, i když historii nechal být', async () => {
    await expect(
      db.exec("INSERT INTO projects (client_name, source) VALUES ('Pokus', 'facebook')"),
    ).rejects.toThrow()
    await expect(
      db.exec("INSERT INTO projects (client_name, status) VALUES ('Pokus', 'hotovo')"),
    ).rejects.toThrow()
    await expect(
      db.exec("INSERT INTO projects (client_name, lead_origin) VALUES ('Pokus', 'estetik')"),
    ).rejects.toThrow()
  })

  it('CHECK na neznámou historickou hodnotu zůstal NOT VALID, ostatní se ověřily', async () => {
    const rows = await db.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE conname IN ('projects_source_check', 'projects_status_check', 'projects_lead_origin_check')
       ORDER BY conname`,
    )
    const by = Object.fromEntries(rows.rows.map((r) => [r.conname, r.convalidated]))
    expect(by['projects_lead_origin_check']).toBe(true)
    expect(by['projects_status_check']).toBe(true)
    // 'web' v historii validaci blokuje — a nesmí kvůli tomu spadnout migrace.
    expect(by['projects_source_check']).toBe(false)
  })
})

describe('zdroje poptávek', () => {
  it('každý web má doménu, hodnotu source a vlastní okno rate limitu', () => {
    expect(WEB_LEAD_ORIGINS.map((o) => o.key)).toEqual(['vizeon', 'alteno', 'prvotka'])
    for (const o of WEB_LEAD_ORIGINS) {
      expect(o.domain).toBeTruthy()
      expect(o.source).toBeTruthy()
      expect(bookingRateLimitKey(o.key)).toBe(`${o.key}_booking`)
      expect(leadRateLimitKey(o.key)).toBe(`${o.key}_lead`)
    }
    // Tři weby si limit nesmí brát navzájem.
    const keys = WEB_LEAD_ORIGINS.flatMap((o) => [bookingRateLimitKey(o.key), leadRateLimitKey(o.key)])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('klíče zůstávají ty, které volají cizí repozitáře', () => {
    expect(LEAD_ORIGIN_KEYS.vizeon.booking).toBe('VIZEON_API_KEY')
    expect(LEAD_ORIGIN_KEYS.alteno.booking).toBe('ALTENO_API_KEY')
    expect(LEAD_ORIGIN_KEYS.alteno.lead).toBe('ALTENO_LEAD_WEBHOOK_SECRET')
    expect(LEAD_ORIGIN_KEYS.prvotka.lead).toBe('PRVOTKA_LEAD_WEBHOOK_SECRET')
    // Názvy secretů nesmí být v LEAD_ORIGINS — ten jde i do klientského bundlu.
    expect(JSON.stringify(WEB_LEAD_ORIGINS)).not.toMatch(/_KEY|_SECRET/)
  })

  it('neznámá hodnota zdroje spadne na vizeon', () => {
    expect(toLeadOrigin('alteno')).toBe('alteno')
    expect(toLeadOrigin('prvotka')).toBe('prvotka')
    expect(toLeadOrigin('jiny')).toBe('jiny')
    expect(toLeadOrigin(null)).toBe('vizeon')
    expect(toLeadOrigin('neco')).toBe('vizeon')
  })
})

describe('staré adresy adminu', () => {
  it('odkaz ze starého oznámení nebo e-mailu vede na nové místo', () => {
    expect(resolveLegacyRedirect('/dashboard/vizeon')).toBe('/dashboard/poptavky')
    expect(resolveLegacyRedirect('/alteno/rezervace')).toBe('/dashboard/poptavky')
    expect(resolveLegacyRedirect('/alteno')).toBe('/dashboard/zakazky')
    expect(resolveLegacyRedirect('/alteno/new')).toBe('/dashboard/new')
    expect(resolveLegacyRedirect('/alteno/11111111-1111-4111-8111-111111111111')).toBe(
      '/dashboard/11111111-1111-4111-8111-111111111111',
    )
    expect(resolveLegacyRedirect('/alteno/11111111-1111-4111-8111-111111111111?zalozka=zpravy')).toBe(
      '/dashboard/11111111-1111-4111-8111-111111111111?zalozka=zpravy',
    )
  })

  it('nová adresa se nepřesměrovává', () => {
    expect(resolveLegacyRedirect('/dashboard/poptavky')).toBeNull()
    expect(resolveLegacyRedirect('/dashboard/zakazky')).toBeNull()
  })
})
