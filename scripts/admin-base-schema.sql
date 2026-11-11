-- Základní schéma admin konzole — tabulky, které vznikly v Neon konzoli ručně
-- (2026-06, před první migrací) a žádná migrace je proto nezakládá:
-- `projects`, `client_messages`, `progress_updates`. Na produkci existují,
-- na čisté databázi (testovací Neon, vývoj) chybí a migrace 001+ na nich padají.
--
-- Zdroj pravdy pro sloupce: docs/admin/AGENTS-ADMIN.md → Databázový model.
-- Sloupce přidané migracemi (business, alteno_confirmed, …) tady NEJSOU —
-- doplní je příslušné migrace, aby zůstalo jedno místo pravdy.
--
-- Spuštění (idempotentní, pouští se před migracemi 001+):
--   node scripts/apply-migration.js scripts/admin-base-schema.sql
--
-- Pozor: nikdy proti produkční databázi — tam tabulky už jsou.

CREATE TABLE IF NOT EXISTS projects (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name  text NOT NULL,
  description  text,
  focus        text,
  status       text DEFAULT 'new',
  progress     integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  price        numeric,
  paid         boolean DEFAULT false,
  public_token uuid DEFAULT gen_random_uuid(),
  deadline     date,
  notes        text,
  client_email text,
  project_url  text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz
);

CREATE TABLE IF NOT EXISTS client_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress_updates (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  progress_from integer,
  progress_to   integer,
  description   text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_messages_project ON client_messages (project_id);
CREATE INDEX IF NOT EXISTS idx_progress_updates_project ON progress_updates (project_id);
