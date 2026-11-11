-- Migrace 103: indexy pro obrazovky adminu (AD06)
--
-- Admin dnes řadí a filtruje nad tabulkami, které kromě primárního klíče
-- nemají skoro nic: `client_leads` nemá jediný index, `calendar_events` nemá
-- `starts_at`, `invoices` nemá `issued_on`. Dokud jsou tabulky malé, Postgres
-- je celé přečte a nikomu to nevadí; s pár tisíci řádky začne být vidět každé
-- řazení.
--
-- Aditivní a idempotentní: nic se nepřejmenovává, nemaže ani nepřepisuje,
-- takže **starý build adminu tahle migrace nerozbije** (na rozdíl od 102).
-- Může se aplikovat kdykoli, i před nasazením větve.
--
-- Indexy jsou psané na dotazy, které v kódu opravdu jsou — ne „pro jistotu".
-- Částečné indexy (`WHERE …`) jsou menší a rychlejší než plné: vejdou se do
-- paměti a nenesou řádky, na které se stejně nikdo neptá.
--
-- POZOR: `CREATE INDEX` (bez CONCURRENTLY) na dobu stavby zamkne zápisy do
-- tabulky. Při dnešní velikosti dat jsou to desítky milisekund. Kdyby některá
-- tabulka narostla na statisíce řádků, přepsat na CONCURRENTLY a pustit
-- každý příkaz zvlášť (CONCURRENTLY nejde uvnitř transakce).

-- ─── 1. client_leads: Hovory, kalendář, Dnes ─────────────────────────────────
-- Výpis Hovorů řadí `ORDER BY created_at DESC` nad celou tabulkou.
CREATE INDEX IF NOT EXISTS client_leads_created_idx
  ON client_leads (created_at DESC);

-- Kalendář i Dnes se ptají na „co mě čeká": naplánovaná akce, která ještě
-- neskončila. Částečný index drží jen ty řádky — zavřené a beztermínové leady
-- v něm nejsou vůbec.
CREATE INDEX IF NOT EXISTS client_leads_next_action_idx
  ON client_leads (next_action_date, next_action_time)
  WHERE next_action_date IS NOT NULL
    AND lead_status NOT IN ('converted', 'lost');

-- ─── 2. projects: Dnes, zakázky, kalendář ────────────────────────────────────
CREATE INDEX IF NOT EXISTS projects_status_created_idx
  ON projects (status, created_at DESC);

-- Dnes → „Zakázky bez pohybu": otevřené zakázky seřazené od nejstarší změny.
CREATE INDEX IF NOT EXISTS projects_stale_idx
  ON projects (updated_at)
  WHERE NOT lead_pending AND status IN ('new', 'in_progress', 'review');

-- Termíny v kalendáři.
CREATE INDEX IF NOT EXISTS projects_deadline_idx
  ON projects (deadline)
  WHERE deadline IS NOT NULL;

-- ─── 3. calendar_events ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS calendar_events_starts_idx
  ON calendar_events (starts_at);

CREATE INDEX IF NOT EXISTS calendar_events_project_idx
  ON calendar_events (project_id)
  WHERE project_id IS NOT NULL;

-- ─── 4. invoices ─────────────────────────────────────────────────────────────
-- Evidence faktur řadí podle data vystavení; `invoices_project_idx` (jen
-- project_id) na to nestačí, detail zakázky řadí uvnitř zakázky taky.
CREATE INDEX IF NOT EXISTS invoices_issued_idx
  ON invoices (issued_on DESC);

CREATE INDEX IF NOT EXISTS invoices_project_issued_idx
  ON invoices (project_id, issued_on DESC);

-- Nezaplacené faktury: Dnes (po splatnosti) i součty podle měn.
CREATE INDEX IF NOT EXISTS invoices_unpaid_due_idx
  ON invoices (due_on)
  WHERE paid_on IS NULL;

-- ─── 5. finance_transactions ─────────────────────────────────────────────────
-- Přehled zdraví financí se ptá na posledních 12 měsíců vlastních transakcí.
--
-- Pozor: dotazy, které filtrují `EXTRACT(YEAR FROM date) = …` nebo
-- `to_char(date, 'YYYY-MM') = …` (roční příjem, peníze za měsíc na Dnes),
-- tenhle index **použít nemůžou** — funkce nad sloupcem z porovnání dělá
-- něco, co index neumí dohledat. Přepsat je na rozsah `date >= … AND date < …`
-- patří k nápravě financí v AD13; dokud je transakcí pár tisíc, nevadí to.
CREATE INDEX IF NOT EXISTS finance_transactions_own_date_idx
  ON finance_transactions (date)
  WHERE user_id IS NULL;

-- ─── 6. Dokončené a hodnocení ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS completed_projects_completed_idx
  ON completed_projects (completed_at DESC);

CREATE INDEX IF NOT EXISTS project_surveys_created_idx
  ON project_surveys (created_at DESC);

-- `costs (project_id)` už existuje jako `costs_project_idx` (migrace 058),
-- `client_requests` a `project_activity` mají svoje indexy z 092 a 093.

-- ─── 7. pg_trgm: hledání podle části jména ───────────────────────────────────
-- Příprava pro hledání v ⌘K a filtry výpisů (AD07). Dnes ⌘K prochází jen
-- názvy stránek v prohlížeči, do databáze nesahá — tyhle indexy tedy zatím
-- nic nezrychlují, ale bez nich by `ILIKE '%něco%'` nad zakázkami a leady
-- znamenal pokaždé přečíst celou tabulku.
--
-- Když databáze `pg_trgm` nemá (třeba PGlite v testech), migrace to oznámí
-- a jede dál — zbytek indexů je důležitější než hledání.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm není k dispozici (%), trigramové indexy se nezakládají', SQLERRM;
    RETURN;
  END;

  CREATE INDEX IF NOT EXISTS client_leads_company_trgm_idx ON client_leads USING gin (company_name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS client_leads_contact_trgm_idx ON client_leads USING gin (contact_name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS projects_client_trgm_idx      ON projects     USING gin (client_name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS projects_description_trgm_idx ON projects     USING gin (description gin_trgm_ops);
END $$;

-- ─── 8. Čerstvé statistiky ───────────────────────────────────────────────────
-- Bez nich plánovač chvíli počítá se starými odhady a nový index nemusí použít.
ANALYZE client_leads;
ANALYZE projects;
ANALYZE calendar_events;
ANALYZE invoices;
ANALYZE finance_transactions;
ANALYZE completed_projects;
ANALYZE project_surveys;
