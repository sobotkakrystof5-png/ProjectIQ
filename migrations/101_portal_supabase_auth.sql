-- Migrace 101: klientský prostor — přihlášení přes Supabase Auth místo Clerku (R-080)
--
-- Člena firmy teď určuje id uživatele Supabase Auth (portal.members.user_id).
-- Starý sloupec clerk_user_id a funkce member_lookup/redeem_invite zůstávají,
-- protože 095 se musí dát pustit znovu; aplikace je už nevolá a portal_app
-- k nim ztrácí práva.
--
-- Nové funkce (stejná pravidla jako původní, jen klíč user_id):
--   portal.memberships_for_user(user_id)  — firmy přihlášeného, nejstarší první
--   portal.redeem_invite_for_user(...)    — uplatnění pozvánky
--
-- Idempotentní. Po migraci znovu pustit scripts/portal-grants.sql
-- (node scripts/portal-create-role.js).

ALTER TABLE portal.members ADD COLUMN IF NOT EXISTS user_id text
  CHECK (user_id IS NULL OR char_length(user_id) BETWEEN 1 AND 200);
ALTER TABLE portal.members ALTER COLUMN clerk_user_id DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE portal.members ADD CONSTRAINT members_identity_check
    CHECK (user_id IS NOT NULL OR clerk_user_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS members_client_user_uq ON portal.members (client_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS members_user_idx ON portal.members (user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION portal.memberships_for_user(p_user_id text)
RETURNS TABLE (client_id uuid, member_id uuid, role text, client_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
  SELECT m.client_id, m.id, m.role, c.name
  FROM portal.members m JOIN portal.clients c ON c.id = m.client_id
  WHERE m.user_id = p_user_id AND m.removed_at IS NULL AND c.archived_at IS NULL
  ORDER BY m.created_at
$$;

-- Platná, nepoužitá, nezrušená, neprošlá pozvánka; je-li vázaná na e-mail, musí
-- sedět s ověřeným e-mailem přihlášeného. Vrací client_id, jinak NULL. Atomické.
CREATE OR REPLACE FUNCTION portal.redeem_invite_for_user(p_code_hash text, p_user_id text, p_email text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  inv portal.invites%ROWTYPE;
  member_id uuid;
BEGIN
  IF p_code_hash IS NULL OR p_user_id IS NULL OR char_length(p_user_id) = 0 THEN
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

  INSERT INTO portal.members (client_id, user_id, email, name, role)
  VALUES (inv.client_id, p_user_id, left(p_email, 320), left(p_name, 200), inv.role)
  ON CONFLICT (client_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
    SET removed_at = NULL, email = EXCLUDED.email, name = coalesce(EXCLUDED.name, portal.members.name)
  RETURNING id INTO member_id;

  UPDATE portal.invites SET used_at = now(), used_by = member_id WHERE id = inv.id;
  RETURN inv.client_id;
END
$$;

REVOKE ALL ON FUNCTION portal.memberships_for_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.redeem_invite_for_user(text, text, text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT EXECUTE ON FUNCTION portal.memberships_for_user(text) TO portal_app;
    GRANT EXECUTE ON FUNCTION portal.redeem_invite_for_user(text, text, text, text) TO portal_app;
    REVOKE EXECUTE ON FUNCTION portal.member_lookup(text) FROM portal_app;
    REVOKE EXECUTE ON FUNCTION portal.redeem_invite(text, text, text, text) FROM portal_app;
  END IF;
END
$$;
