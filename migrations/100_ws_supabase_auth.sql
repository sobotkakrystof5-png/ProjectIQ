-- Migrace 100: Workspace — přihlášení přes Supabase Auth místo Clerku (R-080)
--
-- Clerk Organizations nahrazuje tabulka ws.members: kdo patří do kterého účtu
-- a s jakou rolí, teď víme jen z databáze. Identita člověka je id uživatele
-- Supabase Auth (auth.users.id jako text).
--
-- 1. ws.members.clerk_user_id → user_id (stejný typ text, data zůstávají; staré
--    Clerk id se už nikdo nepřihlásí — Workspace ještě neběží naostro).
-- 2. Jeden člověk vlastní nejvýš jeden účet (R-026) — dřív hlídal Clerk přes
--    organizaci, teď unikátní index. Brání i dvojímu založení účtu dvojklikem.
-- 3. ws.membership_for_user(): účet a role přihlášeného člověka. Nahrazuje
--    ws.account_by_clerk_org(). Volitelný p_account = účet zvolený v přepínači
--    (cookie); bez něj nebo u cizího účtu nejstarší členství.
-- 4. ws.business_scope() klíčuje podle uživatele místo Clerk organizace.
-- 5. ws.accounts.clerk_org_id už není povinný (nové účty ho nemají). Sloupec
--    zůstává kvůli starším migracím (064, 084, 085, 091), které se musí dát pustit
--    znovu; ws.purge_closed_accounts() ho dál vrací, aplikace ho ignoruje.
-- 6. ws.account_invites + ws.redeem_account_invite(): pozvánka vlastníka do účtu,
--    který založil admin (S17). Dřív pozvánka organizace v Clerku.
--
-- Idempotentní. Po migraci znovu pustit scripts/ws-grants.sql (node scripts/ws-create-role.js).

-- 1 ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ws' AND table_name = 'members' AND column_name = 'clerk_user_id'
  ) THEN
    ALTER TABLE ws.members RENAME COLUMN clerk_user_id TO user_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ws.members'::regclass AND conname = 'members_account_id_clerk_user_id_key'
  ) THEN
    ALTER TABLE ws.members RENAME CONSTRAINT members_account_id_clerk_user_id_key TO members_account_id_user_id_key;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS members_user_idx ON ws.members (user_id, created_at);

-- 2 ---------------------------------------------------------------------------
-- Stará testovací data z Clerku můžou mít jednoho vlastníka ve víc účtech —
-- pak index nevznikne a migrace to jen ohlásí (nic nemaže).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'ws' AND indexname = 'members_one_owned_account_uq') THEN
    IF EXISTS (SELECT 1 FROM ws.members WHERE role = 'owner' GROUP BY user_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'ws.members: některý uživatel vlastní víc účtů, index members_one_owned_account_uq nevznikl';
    ELSE
      CREATE UNIQUE INDEX members_one_owned_account_uq ON ws.members (user_id) WHERE role = 'owner';
    END IF;
  END IF;
END
$$;

-- 3 ---------------------------------------------------------------------------
-- SECURITY DEFINER: pod RLS by bez nastaveného účtu neviděla nic. Klíčem je id
-- přihlášeného uživatele (ověřené Supabase Auth), takže vrátí nejvýš jeho členství.
CREATE OR REPLACE FUNCTION ws.membership_for_user(p_user_id text, p_account uuid DEFAULT NULL)
RETURNS TABLE (account_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.account_id, m.role
  FROM ws.members m
  WHERE m.user_id = p_user_id
  ORDER BY (m.account_id = p_account) IS TRUE DESC, m.created_at, m.id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ws.membership_for_user(text, uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS ws.account_by_clerk_org(text);

-- 4 ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS ws.business_scope(text, text);

CREATE OR REPLACE FUNCTION ws.business_scope(p_user_id text, p_account uuid, business_slug text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'account_id', a.id,
    'role', mem.role,
    'business', (
      SELECT to_jsonb(b) FROM (
        SELECT id, account_id, name, slug, industry, color, logo_url, timezone, settings, archived_at
        FROM ws.businesses
        WHERE account_id = a.id AND slug = business_slug AND archived_at IS NULL
      ) b
    ),
    'businesses', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'slug', x.slug) ORDER BY x.created_at), '[]'::jsonb)
      FROM ws.businesses x
      WHERE x.account_id = a.id AND x.archived_at IS NULL
    ),
    'modules', (
      SELECT coalesce(jsonb_agg(m.module), '[]'::jsonb)
      FROM ws.business_modules m
      JOIN ws.businesses cur ON cur.id = m.business_id AND cur.account_id = m.account_id
      WHERE m.account_id = a.id AND m.enabled
        AND cur.slug = business_slug AND cur.archived_at IS NULL
    ),
    'subscriptions', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'status', s.status,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'past_due_since', s.past_due_since,
        'created_at', s.created_at
      )), '[]'::jsonb)
      FROM ws.subscriptions s
      WHERE s.account_id = a.id
    )
  )
  FROM ws.membership_for_user(p_user_id, p_account) mem
  JOIN ws.accounts a ON a.id = mem.account_id
$$;

REVOKE ALL ON FUNCTION ws.business_scope(text, uuid, text) FROM PUBLIC;

-- 5 ---------------------------------------------------------------------------
ALTER TABLE ws.accounts ALTER COLUMN clerk_org_id DROP NOT NULL;
COMMENT ON COLUMN ws.accounts.clerk_org_id IS 'Zastaralé (Clerk do migrace 100). Nové účty NULL, nepoužívat.';

-- 6 ---------------------------------------------------------------------------
-- V DB jen HMAC hash jednorázového kódu (jako portal.invites). ws_app k tabulce
-- nemá žádná práva, kód uplatní jen funkce ws.redeem_account_invite.
CREATE TABLE IF NOT EXISTS ws.account_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  code_hash text NOT NULL UNIQUE CHECK (char_length(code_hash) BETWEEN 32 AND 128),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  used_at timestamptz,
  used_by text CHECK (used_by IS NULL OR char_length(used_by) <= 200),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_invites_account_idx ON ws.account_invites (account_id, created_at DESC);
SELECT ws.enable_account_rls('ws.account_invites');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    REVOKE ALL ON ws.account_invites FROM ws_app;
  END IF;
END
$$;

-- Platná, nepoužitá, nezrušená, neprošlá pozvánka a ověřený e-mail přihlášeného
-- shodný s e-mailem pozvánky. Vrací account_id, jinak NULL. Atomické. Vlastník
-- jiného účtu narazí na members_one_owned_account_uq (23505) — aplikace to řekne.
CREATE OR REPLACE FUNCTION ws.redeem_account_invite(p_code_hash text, p_user_id text, p_email text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  inv ws.account_invites%ROWTYPE;
BEGIN
  IF p_code_hash IS NULL OR p_user_id IS NULL OR char_length(p_user_id) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT i.* INTO inv
  FROM ws.account_invites i
  WHERE i.code_hash = p_code_hash AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF lower(inv.email) <> lower(coalesce(p_email, '')) THEN
    RETURN NULL;
  END IF;

  INSERT INTO ws.members (account_id, user_id, role, name, email)
  VALUES (inv.account_id, p_user_id, inv.role, left(p_name, 200), left(p_email, 320))
  ON CONFLICT (account_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, email = EXCLUDED.email, name = coalesce(EXCLUDED.name, ws.members.name);

  UPDATE ws.account_invites SET used_at = now(), used_by = p_user_id WHERE id = inv.id;
  RETURN inv.account_id;
END
$$;

REVOKE ALL ON FUNCTION ws.redeem_account_invite(text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.membership_for_user(text, uuid) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.business_scope(text, uuid, text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.redeem_account_invite(text, text, text, text) TO ws_app;
  END IF;
END
$$;
