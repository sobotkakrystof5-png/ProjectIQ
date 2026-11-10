-- 000: základní schéma adminu (projects, client_messages, progress_updates).
--
-- Na Neonu tyhle tabulky vznikly ručně ze schématu v CLAUDE.md ještě před
-- číslovanými migracemi, takže je žádná migrace nezakládala. Bez nich nejde
-- čistou databázi (Supabase, testy) postavit od nuly — 001 na projects
-- odkazuje cizím klíčem. Sloupce, které přidaly pozdější migrace (client_email,
-- project_url, business, …), tu záměrně nejsou; doplní je ty migrace.
-- Idempotentní: na databázi, kde tabulky už jsou, nic nemění.

CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  description text,
  focus text,
  status text DEFAULT 'new',
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  price numeric,
  paid boolean DEFAULT false,
  public_token uuid DEFAULT gen_random_uuid(),
  deadline date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS client_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  progress_from integer,
  progress_to integer,
  description text,
  created_at timestamptz DEFAULT now()
);
