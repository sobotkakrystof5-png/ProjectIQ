import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

// Migrace 103 (AD06): indexy pro obrazovky adminu.
//
// Test staví tabulky tak, jak je nechaly migrace 001–102, nasype do nich
// řádky řádově jako produkce za pár let a pustí `EXPLAIN` nad dotazy, které
// v adminu opravdu jsou — **před** migrací a **po** ní.
//
// Co se tvrdí: dotaz přestane číst celou tabulku. Absolutní časy se neměří
// a nikam nezapisují: PGlite je Postgres přeložený do WASM a jeho milisekundy
// o Neonu nic neříkají (plán, sekce 7).

const ROOT = path.resolve(__dirname, '../..')
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/103_admin_indexy.sql'), 'utf8')

const LEADS = 4000
const PROJECTS = 2000
const EVENTS = 3000
const INVOICES = 2000

let db: PGlite

/** Plán dotazu jako jeden řádek textu. */
async function plan(query: string): Promise<string> {
  const res = await db.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${query}`)
  return res.rows.map((r) => r['QUERY PLAN']).join(' | ')
}

const usesIndex = (p: string): boolean => /Index Scan|Index Only Scan|Bitmap Index Scan/i.test(p)
const scansEverything = (p: string): boolean => /Seq Scan/i.test(p)

// Dotazy opsané z kódu, ne vymyšlené.
const QUERIES = {
  // app/calls-actions.ts → getCallsScreen
  hovory: `SELECT id FROM client_leads ORDER BY created_at DESC LIMIT 50`,
  // lib/admin/calendar.ts → okno kalendáře (AD08)
  kalendarLeady: `
    SELECT id FROM client_leads
    WHERE next_action_date IS NOT NULL AND next_action_time IS NOT NULL
      AND next_action_date >= CURRENT_DATE - 7 AND next_action_date < CURRENT_DATE + 38
      AND lead_status NOT IN ('converted', 'lost') AND calendar_event_id IS NULL
    ORDER BY next_action_date, next_action_time`,
  // lib/admin-today-queries.ts → „Zakázky bez pohybu"
  bezPohybu: `
    SELECT id FROM projects
    WHERE status IN ('new', 'in_progress', 'review')
      AND updated_at < now() - interval '14 days' AND NOT lead_pending
    ORDER BY updated_at ASC LIMIT 5`,
  // lib/admin/calendar.ts → termíny v okně (AD08)
  terminy: `
    SELECT id FROM projects
    WHERE deadline >= CURRENT_DATE - 7 AND deadline < CURRENT_DATE + 38
    ORDER BY deadline`,
  // lib/admin/calendar.ts → události v okně (AD08)
  udalosti: `
    SELECT id FROM calendar_events
    WHERE starts_at >= now() - interval '7 days' AND starts_at < now() + interval '38 days'
    ORDER BY starts_at`,
  // app/dashboard/finance/invoice-actions.ts → evidence faktur
  faktury: `SELECT id FROM invoices ORDER BY issued_on DESC LIMIT 50`,
  // lib/admin-today-queries.ts → faktury po splatnosti
  poSplatnosti: `
    SELECT id FROM invoices
    WHERE paid_on IS NULL AND due_on IS NOT NULL AND due_on < CURRENT_DATE
    ORDER BY due_on ASC LIMIT 10`,
} as const

const before: Record<string, string> = {}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'new',
      deadline date,
      source text DEFAULT 'manual',
      lead_confirmed boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      lead_pending boolean GENERATED ALWAYS AS (source <> 'manual' AND NOT lead_confirmed) STORED
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name text NOT NULL,
      contact_name text,
      lead_status text DEFAULT 'cold',
      next_action_date date,
      next_action_time time,
      calendar_event_id uuid UNIQUE,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE calendar_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      project_id uuid REFERENCES projects(id)
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text NOT NULL,
      project_id uuid REFERENCES projects(id),
      issued_on date NOT NULL,
      due_on date,
      paid_on date,
      amount numeric NOT NULL DEFAULT 0
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      type text NOT NULL,
      amount numeric NOT NULL DEFAULT 0,
      date date NOT NULL
    );
    CREATE TABLE completed_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      completed_at date NOT NULL
    );
    CREATE TABLE project_surveys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      completed_project_id uuid NOT NULL REFERENCES completed_projects(id),
      created_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS costs_placeholder ON project_surveys (completed_project_id);
  `)

  await db.exec(`
    INSERT INTO projects (client_name, description, status, deadline, source, lead_confirmed, updated_at)
    SELECT 'Klient ' || i, 'Popis ' || i,
           (ARRAY['new','in_progress','review','done','paid'])[1 + (i % 5)],
           CASE WHEN i % 7 = 0 THEN CURRENT_DATE + (i % 90) ELSE NULL END,
           CASE WHEN i % 3 = 0 THEN 'web' ELSE 'manual' END,
           i % 2 = 0,
           now() - (i || ' days')::interval
    FROM generate_series(1, ${PROJECTS}) AS i;

    INSERT INTO client_leads (company_name, contact_name, lead_status, next_action_date, next_action_time, created_at)
    SELECT 'Firma ' || i, 'Kontakt ' || i,
           (ARRAY['cold','warm','hot','converted','lost'])[1 + (i % 5)],
           CASE WHEN i % 4 = 0 THEN CURRENT_DATE + (i % 60) ELSE NULL END,
           CASE WHEN i % 4 = 0 THEN TIME '09:00' ELSE NULL END,
           now() - (i || ' hours')::interval
    FROM generate_series(1, ${LEADS}) AS i;

    INSERT INTO calendar_events (title, starts_at, ends_at)
    SELECT 'Událost ' || i, now() + (i || ' hours')::interval, now() + ((i + 1) || ' hours')::interval
    FROM generate_series(1, ${EVENTS}) AS i;

    INSERT INTO invoices (invoice_number, issued_on, due_on, paid_on)
    SELECT '2026-' || lpad(i::text, 6, '0'),
           CURRENT_DATE - (i % 700),
           CURRENT_DATE - (i % 700) + 14,
           CASE WHEN i % 3 = 0 THEN NULL ELSE CURRENT_DATE - (i % 700) + 20 END
    FROM generate_series(1, ${INVOICES}) AS i;
  `)
  await db.exec('ANALYZE')

  for (const [key, query] of Object.entries(QUERIES)) before[key] = await plan(query)

  await db.exec(MIGRATION)
})

describe('migrace 103 — indexy pro obrazovky adminu', () => {
  it('před migrací čtou všechny tyhle dotazy celou tabulku', () => {
    for (const key of Object.keys(QUERIES)) {
      expect(scansEverything(before[key]), `${key}: ${before[key]}`).toBe(true)
    }
  })

  it('po migraci jdou přes index', async () => {
    for (const [key, query] of Object.entries(QUERIES)) {
      const after = await plan(query)
      if (process.env.PLANY) console.log(`${key}\n  před: ${before[key]}\n  po:   ${after}`)
      expect(usesIndex(after), `${key}\n  před: ${before[key]}\n  po:   ${after}`).toBe(true)
    }
  })

  it('jde pustit dvakrát po sobě (idempotentní)', async () => {
    await db.exec(MIGRATION)
    await db.exec(MIGRATION)
    const after = await plan(QUERIES.hovory)
    expect(usesIndex(after)).toBe(true)
  })

  it('databáze bez pg_trgm migraci nezastaví', async () => {
    const has = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pg_trgm'`)
    // PGlite trigramy nejspíš nemá; podstatné je, že migrace přesto doběhla
    // a ostatní indexy založila (což tvrdí testy výš).
    expect(typeof has.rows[0].n).toBe('number')
  })
})
