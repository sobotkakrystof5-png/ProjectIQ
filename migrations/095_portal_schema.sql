-- Klientský prostor I (KP05): schéma `portal` a oddělení klientů.
--
-- Pravidlo: klient vidí jen věci z tohoto schématu a role `portal_app` NEMÁ žádná
-- práva do schématu `public` (interní poznámky, ceny, e-maily, koncepty hlášení).
-- Do `portal` se z adminu dostává jen schválené, přes databázové triggery:
--   public.projects          -> portal.projects   (jen vybrané sloupce zakázky)
--   public.project_activity  -> portal.activity   (jen status = 'published')
-- Každá tabulka s daty klienta má client_id, složené cizí klíče (client_id, id)
-- a Row Level Security podle app.client_id nastaveného v transakci.
-- Role portal_app se zakládá skriptem scripts/portal-create-role.js, nikdy
-- v konzoli Neonu (konzolové role obcházejí RLS). Idempotentní.
-- Vyžaduje migraci 093 (project_activity).

CREATE SCHEMA IF NOT EXISTS portal;

CREATE TABLE IF NOT EXISTS portal.clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS portal.members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES portal.clients(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL CHECK (char_length(clerk_user_id) BETWEEN 1 AND 200),
  email text CHECK (email IS NULL OR char_length(email) <= 320),
  name text CHECK (name IS NULL OR char_length(name) <= 200),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (client_id, id),
  UNIQUE (client_id, clerk_user_id)
);

-- Pozvánky: v DB jen HMAC hash jednorázového kódu. Role portal_app k nim nemá
-- žádný přístup, kód uplatní jen funkce portal.redeem_invite.
CREATE TABLE IF NOT EXISTS portal.invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES portal.clients(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  email text CHECK (email IS NULL OR char_length(email) <= 320),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES portal.members(id) ON DELETE SET NULL,
  revoked_at timestamptz
);

-- Projekce zakázky: jen to, co smí klient vidět. Bez ceny, poznámek, e-mailu
-- klienta a veřejného tokenu /p. id je shodné s public.projects.id.
CREATE TABLE IF NOT EXISTS portal.projects (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES portal.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  deadline date,
  project_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id)
);
CREATE INDEX IF NOT EXISTS portal_projects_client_idx ON portal.projects (client_id);

-- Schválené zprávy o práci. Kopíruje je trigger z public.project_activity.
CREATE TABLE IF NOT EXISTS portal.activity (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  published_at timestamptz NOT NULL,
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_activity_project_idx ON portal.activity (client_id, project_id, published_at DESC);

-- --- Kontext klienta pro RLS ---------------------------------------------------

CREATE OR REPLACE FUNCTION portal.current_client() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.client_id', true), '')::uuid
$$;

ALTER TABLE portal.clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.activity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = 'clients' AND policyname = 'client_isolation') THEN
    CREATE POLICY client_isolation ON portal.clients USING (id = portal.current_client()) WITH CHECK (id = portal.current_client());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = 'members' AND policyname = 'client_isolation') THEN
    CREATE POLICY client_isolation ON portal.members USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = 'invites' AND policyname = 'client_isolation') THEN
    CREATE POLICY client_isolation ON portal.invites USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = 'projects' AND policyname = 'client_isolation') THEN
    CREATE POLICY client_isolation ON portal.projects USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = 'activity' AND policyname = 'client_isolation') THEN
    CREATE POLICY client_isolation ON portal.activity USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client());
  END IF;
END $$;

-- --- Přihlášení: funkce, které smějí běžet před známým klientem -----------------

-- Klienti, do kterých patří přihlášený člověk (Clerk user id). Nejstarší první.
CREATE OR REPLACE FUNCTION portal.member_lookup(p_clerk_user_id text)
RETURNS TABLE (client_id uuid, member_id uuid, role text, client_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
  SELECT m.client_id, m.id, m.role, c.name
  FROM portal.members m JOIN portal.clients c ON c.id = m.client_id
  WHERE m.clerk_user_id = p_clerk_user_id AND m.removed_at IS NULL AND c.archived_at IS NULL
  ORDER BY m.created_at
$$;

-- Uplatnění pozvánky: platná, nepoužitá, nezrušená, neprošlá a (je-li vázaná na
-- e-mail) shodná s e-mailem přihlášeného. Vrací client_id, jinak NULL. Atomické.
CREATE OR REPLACE FUNCTION portal.redeem_invite(p_code_hash text, p_clerk_user_id text, p_email text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  inv portal.invites%ROWTYPE;
  member_id uuid;
BEGIN
  IF p_code_hash IS NULL OR p_clerk_user_id IS NULL OR char_length(p_clerk_user_id) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT i.* INTO inv
  FROM portal.invites i JOIN portal.clients c ON c.id = i.client_id
  WHERE i.code_hash = p_code_hash AND i.used_at IS NULL AND i.revoked_at IS NULL
    AND i.expires_at > now() AND c.archived_at IS NULL
  FOR UPDATE OF i;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF inv.email IS NOT NULL AND lower(inv.email) <> lower(coalesce(p_email, '')) THEN
    RETURN NULL;
  END IF;

  INSERT INTO portal.members (client_id, clerk_user_id, email, name, role)
  VALUES (inv.client_id, p_clerk_user_id, left(p_email, 320), left(p_name, 200), inv.role)
  ON CONFLICT (client_id, clerk_user_id) DO UPDATE
    SET removed_at = NULL, email = EXCLUDED.email, name = coalesce(EXCLUDED.name, portal.members.name)
  RETURNING id INTO member_id;

  UPDATE portal.invites SET used_at = now(), used_by = member_id WHERE id = inv.id;
  RETURN inv.client_id;
END
$$;

-- --- Propojení zakázky s klientem (volá admin vlastníkem tabulek) ---------------

CREATE OR REPLACE FUNCTION portal.link_project(p_client uuid, p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project AND client_id <> p_client) THEN
    RAISE EXCEPTION 'Zakázka už patří jinému klientovi.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO portal.projects (id, client_id, name, description, status, progress, deadline, project_url, updated_at)
  SELECT p.id, p_client, p.client_name, p.description, p.status, p.progress, p.deadline, p.project_url, p.updated_at
  FROM public.projects p WHERE p.id = p_project
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project) THEN
    RAISE EXCEPTION 'Zakázka neexistuje.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO portal.activity (id, client_id, project_id, kind, title, body, published_at)
  SELECT a.id, p_client, a.project_id, a.kind, a.title, a.body, a.published_at
  FROM public.project_activity a
  WHERE a.project_id = p_project AND a.status = 'published' AND a.published_at IS NOT NULL
  ON CONFLICT (id) DO NOTHING;
END
$$;

CREATE OR REPLACE FUNCTION portal.unlink_project(p_project uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
  DELETE FROM portal.projects WHERE id = p_project
$$;

-- --- Triggery: do portal jde jen schválené -------------------------------------

CREATE OR REPLACE FUNCTION portal.sync_project() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal.projects WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  UPDATE portal.projects
  SET name = NEW.client_name, description = NEW.description, status = NEW.status,
      progress = NEW.progress, deadline = NEW.deadline, project_url = NEW.project_url,
      updated_at = NEW.updated_at
  WHERE id = NEW.id;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION portal.sync_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  owner_client uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal.activity WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NOT NULL AND NOT NEW.contains_sensitive THEN
    SELECT client_id INTO owner_client FROM portal.projects WHERE id = NEW.project_id;
    IF owner_client IS NOT NULL THEN
      INSERT INTO portal.activity (id, client_id, project_id, kind, title, body, published_at)
      VALUES (NEW.id, owner_client, NEW.project_id, NEW.kind, NEW.title, NEW.body, NEW.published_at)
      ON CONFLICT (id) DO UPDATE
        SET kind = EXCLUDED.kind, title = EXCLUDED.title, body = EXCLUDED.body, published_at = EXCLUDED.published_at;
    END IF;
  ELSE
    DELETE FROM portal.activity WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS portal_sync_project ON public.projects;
CREATE TRIGGER portal_sync_project
  AFTER UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION portal.sync_project();

DROP TRIGGER IF EXISTS portal_sync_activity ON public.project_activity;
CREATE TRIGGER portal_sync_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.project_activity
  FOR EACH ROW EXECUTE FUNCTION portal.sync_activity();

-- Funkce jsou SECURITY DEFINER: nikdo je nespouští, dokud to výslovně neumožní
-- scripts/portal-grants.sql (portal_app: member_lookup, redeem_invite).
REVOKE ALL ON FUNCTION portal.member_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.redeem_invite(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.link_project(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.unlink_project(uuid) FROM PUBLIC;
