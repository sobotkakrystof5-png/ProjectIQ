import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Migrace 106 (AD11) proti skutečnému Postgresu (PGlite).
//
// Nejdůležitější test celého sezení je `součet příjmů sedí na korunu`:
// migrace sahá na čísla, ze kterých se počítá daň, a podmínka pro její
// přijetí je, že se žádné z nich nezmění. Zbytek ověřuje, že se přitom nic
// neztratí — ani ručně doplněná historie, ani hodnocení, ani odkaz
// z dotazníku, který už klientovi odešel e-mailem.

const ROOT = path.resolve(__dirname, '../..')
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/106_zakazka_jedina_pravda.sql'), 'utf8')

let db: PGlite
/** Součty příjmů po letech před migrací — proti nim se po migraci porovnává. */
let prijmyPred: { rok: string; castka: string; pocet: number }[]

/** Tentýž dotaz, jaký počítá `scripts/admin-income-check.mjs`. */
async function prijmyPoLetech() {
  const res = await db.query<{ rok: string; castka: string; pocet: number }>(`
    SELECT to_char(date_trunc('year', date), 'YYYY') AS rok,
           count(*)::int AS pocet,
           COALESCE(SUM(amount), 0)::text AS castka
    FROM finance_transactions
    WHERE type = 'income' AND user_id IS NULL
    GROUP BY 1 ORDER BY 1
  `)
  return res.rows
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(sql, params)
  return res.rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  // Tabulky tak, jak je nechaly migrace 001–105 — jen sloupce, kterých se
  // AD11 týká. `lead_pending` je generovaný sloupec z migrace 102: nikdy se
  // do něj nezapisuje a migrace 106 to musí respektovat.
  await db.exec(`
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_name text NOT NULL,
      client_email text,
      description text,
      status text NOT NULL DEFAULT 'new',
      progress integer DEFAULT 0,
      price numeric,
      paid boolean DEFAULT false,
      deposit_amount numeric,
      deposit_paid boolean DEFAULT false,
      notes text,
      source text DEFAULT 'manual',
      lead_origin text NOT NULL DEFAULT 'vizeon',
      lead_confirmed boolean NOT NULL DEFAULT false,
      lead_pending boolean GENERATED ALWAYS AS
        (source IS NOT NULL AND source <> 'manual' AND NOT lead_confirmed) STORED,
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz
    );
    CREATE TABLE completed_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      client_name text,
      company text,
      completed_at date NOT NULL,
      amount numeric NOT NULL DEFAULT 0,
      deposit_amount numeric,
      difficulty integer NOT NULL DEFAULT 5,
      time_invested numeric,
      estimated_hours numeric,
      notes text,
      project_type text NOT NULL DEFAULT 'client',
      survey_token uuid DEFAULT gen_random_uuid(),
      client_email text,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE project_surveys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      completed_project_id uuid NOT NULL REFERENCES completed_projects(id) ON DELETE CASCADE,
      rating_cooperation integer NOT NULL DEFAULT 5,
      rating_speed integer NOT NULL DEFAULT 5,
      rating_design integer NOT NULL DEFAULT 5,
      rating_functionality integer NOT NULL DEFAULT 5,
      rating_reliability integer NOT NULL DEFAULT 5,
      rating_flexibility integer NOT NULL DEFAULT 5,
      reference_text text,
      consent boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT project_surveys_completed_project_id_key UNIQUE (completed_project_id)
    );
    CREATE TABLE finance_transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      amount numeric NOT NULL,
      type text NOT NULL,
      category text,
      note text,
      date date NOT NULL,
      user_id uuid,
      declared boolean DEFAULT false,
      deposit_transaction boolean DEFAULT false,
      source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      source_completed_project_id uuid REFERENCES completed_projects(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now()
    );
  `)

  // ── Data: pět případů, které migrace musí zvládnout ───────────────────────
  await db.exec(`
    INSERT INTO contacts (id, display_name) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Jan Novák');

    -- 1. Zakázka zaplacená přes updateProject a pak označená za dokončenou.
    --    Příjem visí na zakázce; Dokončené k ní žádný příjem nepřidaly.
    INSERT INTO projects (id, client_name, description, status, price, paid, created_at)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Truhlářství Dřevo', 'Web pro truhlářství',
            'in_progress', 48000, true, '2025-03-01');
    INSERT INTO finance_transactions (amount, type, category, note, date, source_project_id)
    VALUES (48000, 'income', 'zakázka', 'Truhlářství Dřevo — Web', '2025-04-10',
            'aaaaaaaa-0000-0000-0000-000000000001');
    INSERT INTO completed_projects (id, title, client_name, completed_at, amount, difficulty,
                                    time_invested, estimated_hours, project_type, survey_token,
                                    source_project_id, contact_id)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'Web pro truhlářství', 'Truhlářství Dřevo',
            '2025-04-12', 48000, 7, 40, 32, 'client',
            '55555555-5555-5555-5555-555555555551',
            'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
    INSERT INTO project_surveys (completed_project_id, reference_text, consent)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'Skvělá spolupráce.', true);

    -- 2. Ručně doplněná historie: Dokončené bez zakázky, s vlastním příjmem.
    INSERT INTO completed_projects (id, title, client_name, company, completed_at, amount,
                                    deposit_amount, difficulty, project_type, survey_token,
                                    client_email, notes)
    VALUES ('cccccccc-0000-0000-0000-000000000002', 'E-shop Kola', 'Petr Kolář', 'Kola s.r.o.',
            '2025-09-20', 62000, 20000, 6, 'client',
            '55555555-5555-5555-5555-555555555552', 'petr@example.cz', 'Historie z tabulky.');
    INSERT INTO finance_transactions (amount, type, category, note, date, source_completed_project_id)
    VALUES (62000, 'income', 'dokončený projekt', 'E-shop Kola — Petr Kolář', '2025-09-20',
            'cccccccc-0000-0000-0000-000000000002');

    -- 3. Osobní projekt bez klienta (vlastní aplikace), taky s příjmem.
    INSERT INTO completed_projects (id, title, completed_at, amount, difficulty,
                                    time_invested, project_type, survey_token)
    VALUES ('cccccccc-0000-0000-0000-000000000003', 'Interní fakturační nástroj',
            '2026-02-01', 0, 9, 120, 'personal', '55555555-5555-5555-5555-555555555553');

    -- 4. Otevřená zakázka, které se migrace nesmí dotknout.
    INSERT INTO projects (id, client_name, description, status, price, created_at)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000004', 'Zámečnictví MB', 'Jednostránkový web',
            'in_progress', 25000, '2026-10-01');

    -- 5. Nepotvrzená poptávka z webu — lead_pending je true a musí zůstat.
    INSERT INTO projects (id, client_name, status, source, lead_confirmed, created_at)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000005', 'Poptávka z webu', 'new', 'vizeon_web', false, '2026-11-01');

    -- Příjem, který se zakázkami nesouvisí vůbec (faktura mimo zakázku).
    INSERT INTO finance_transactions (amount, type, category, note, date)
    VALUES (15000, 'income', 'faktura', 'Konzultace', '2026-05-05');
    -- Výdaj a osobní transakce: do kontroly příjmů nesmí vstoupit.
    INSERT INTO finance_transactions (amount, type, category, note, date)
    VALUES (3000, 'expense', 'náklady', 'Hosting', '2026-05-05');
    INSERT INTO finance_transactions (amount, type, category, note, date, user_id)
    VALUES (900, 'income', 'osobní', 'Kapesné', '2026-05-05', gen_random_uuid());
  `)

  prijmyPred = await prijmyPoLetech()
  await db.exec(MIGRATION)
})

afterAll(async () => {
  await db.close()
})

describe('migrace 106 — daňová čísla', () => {
  it('součet příjmů po letech sedí na korunu', async () => {
    const po = await prijmyPoLetech()
    expect(po).toEqual(prijmyPred)
  })

  it('nevznikl ani nezmizel jediný řádek příjmu', async () => {
    const res = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE type = 'income' AND user_id IS NULL`,
    )
    // 48 000 ze zakázky + 62 000 z historie + 15 000 faktura.
    expect(res.n).toBe(3)
  })

  it('jde pustit dvakrát po sobě a nic nezdvojí', async () => {
    await db.exec(MIGRATION)
    await db.exec(MIGRATION)
    const projekty = await one<{ n: number }>(`SELECT count(*)::int AS n FROM projects`)
    const prijmy = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM finance_transactions WHERE type = 'income' AND user_id IS NULL`,
    )
    // 3 původní zakázky + 2 založené z archivu.
    expect(projekty.n).toBe(5)
    expect(prijmy.n).toBe(3)
    expect(await prijmyPoLetech()).toEqual(prijmyPred)
  })
})

describe('Dokončené se zakázkou', () => {
  it('zakázka dostane datum uzavření, čísla výkonnosti i stav hotovo', async () => {
    const p = await one<{
      closed_at: string | null; status: string; difficulty: number | null
      time_invested: string | null; estimated_hours: string | null; price: string
    }>(`SELECT closed_at, status, difficulty, time_invested::text, estimated_hours::text, price::text
        FROM projects WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`)
    expect(p.closed_at).not.toBeNull()
    expect(p.status).toBe('done')
    expect(p.difficulty).toBe(7)
    expect(p.time_invested).toBe('40')
    expect(p.estimated_hours).toBe('32')
    // Cena se nepřepisuje z archivu — zakázka je od teď jediná pravda.
    expect(p.price).toBe('48000')
  })

  it('token dotazníku se přebírá z archivu, aby odeslaný odkaz dál platil', async () => {
    const p = await one<{ survey_token: string }>(
      `SELECT survey_token::text FROM projects WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'`,
    )
    expect(p.survey_token).toBe('55555555-5555-5555-5555-555555555551')
  })

  it('hodnocení se přepojí na zakázku', async () => {
    const s = await one<{ project_id: string | null; reference_text: string }>(
      `SELECT project_id::text, reference_text FROM project_surveys
       WHERE completed_project_id = 'cccccccc-0000-0000-0000-000000000001'`,
    )
    expect(s.project_id).toBe('aaaaaaaa-0000-0000-0000-000000000001')
    expect(s.reference_text).toBe('Skvělá spolupráce.')
  })
})

describe('Dokončené bez zakázky', () => {
  it('vznikne uzavřená zaplacená zakázka s cenou z archivu', async () => {
    const p = await one<{
      id: string; status: string; paid: boolean; price: string; deposit_amount: string | null
      deposit_paid: boolean; closed_at: string | null; client_name: string; company: string | null
      client_email: string | null; contact_id: string | null; lead_pending: boolean
    }>(`SELECT p.id::text, p.status, p.paid, p.price::text, p.deposit_amount::text, p.deposit_paid,
               p.closed_at, p.client_name, p.company, p.client_email, p.contact_id::text, p.lead_pending
        FROM projects p
        JOIN completed_projects_archiv c ON c.migrated_project_id = p.id
        WHERE c.id = 'cccccccc-0000-0000-0000-000000000002'`)
    expect(p.status).toBe('paid')
    expect(p.paid).toBe(true)
    expect(p.price).toBe('62000')
    expect(p.deposit_amount).toBe('20000')
    expect(p.deposit_paid).toBe(true)
    expect(p.closed_at).not.toBeNull()
    expect(p.client_name).toBe('Petr Kolář')
    expect(p.company).toBe('Kola s.r.o.')
    expect(p.client_email).toBe('petr@example.cz')
    // Nesmí spadnout mezi nepotvrzené poptávky.
    expect(p.lead_pending).toBe(false)
  })

  it('příjem se jen přepojí, nevytvoří se druhý', async () => {
    const t = await db.query<{ source_project_id: string | null; amount: string }>(
      `SELECT source_project_id::text, amount::text FROM finance_transactions
       WHERE source_completed_project_id = 'cccccccc-0000-0000-0000-000000000002'`,
    )
    expect(t.rows).toHaveLength(1)
    expect(t.rows[0].source_project_id).not.toBeNull()
    expect(t.rows[0].amount).toBe('62000')
  })

  it('osobní projekt je zakázka druhu personal', async () => {
    const p = await one<{ project_type: string; description: string; client_name: string; difficulty: number }>(
      `SELECT p.project_type, p.description, p.client_name, p.difficulty
       FROM projects p JOIN completed_projects_archiv c ON c.migrated_project_id = p.id
       WHERE c.id = 'cccccccc-0000-0000-0000-000000000003'`,
    )
    expect(p.project_type).toBe('personal')
    expect(p.description).toBe('Interní fakturační nástroj')
    // Osobní projekt klienta nemá — jméno zastoupí název, aby NOT NULL sedělo.
    expect(p.client_name).toBe('Interní fakturační nástroj')
    expect(p.difficulty).toBe(9)
  })
})

describe('čeho se migrace nedotkne', () => {
  it('otevřená zakázka zůstane otevřená', async () => {
    const p = await one<{ status: string; closed_at: string | null; project_type: string }>(
      `SELECT status, closed_at, project_type FROM projects WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004'`,
    )
    expect(p.status).toBe('in_progress')
    expect(p.closed_at).toBeNull()
    expect(p.project_type).toBe('client')
  })

  it('nepotvrzená poptávka zůstane v Poptávkách', async () => {
    const p = await one<{ lead_pending: boolean }>(
      `SELECT lead_pending FROM projects WHERE id = 'aaaaaaaa-0000-0000-0000-000000000005'`,
    )
    expect(p.lead_pending).toBe(true)
  })

  it('archiv se přejmenoval a nic z něj nezmizelo', async () => {
    const a = await one<{ n: number }>(`SELECT count(*)::int AS n FROM completed_projects_archiv`)
    expect(a.n).toBe(3)
    const stara = await db.query(`SELECT to_regclass('public.completed_projects') AS t`)
    expect((stara.rows[0] as { t: string | null }).t).toBeNull()
  })
})

describe('token dotazníku', () => {
  it('každá zakázka má token a žádné dva nejsou stejné', async () => {
    const res = await one<{ bez: number; ruznych: number; vsech: number }>(
      `SELECT count(*) FILTER (WHERE survey_token IS NULL)::int AS bez,
              count(DISTINCT survey_token)::int AS ruznych,
              count(*)::int AS vsech FROM projects`,
    )
    expect(res.bez).toBe(0)
    expect(res.ruznych).toBe(res.vsech)
  })

  it('dvě zakázky nemůžou mít stejný token', async () => {
    await expect(
      db.query(`UPDATE projects SET survey_token = '55555555-5555-5555-5555-555555555551'
                WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004'`),
    ).rejects.toThrow()
  })
})
