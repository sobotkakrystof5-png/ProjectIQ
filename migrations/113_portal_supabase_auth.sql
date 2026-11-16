-- Migrace 113: klientský prostor přechází z Clerku na Supabase Auth (R-107)
--
-- Co se mění:
--   1. `portal.members.clerk_user_id` od teď drží **id uživatele v Supabase Auth**
--      (uuid jako text). Sloupec se nepřejmenovává: migrace 095 definuje nad ním
--      SQL funkci `member_lookup` a při opakovaném běhu migrací (testy v PGlite,
--      R-036) by s novým názvem spadla — a staré migrace se neupravují.
--   2. Členové z doby Clerku (id ve tvaru `user_…`) se vyřadí (`removed_at`).
--      Se Supabase se nikdy nespárují a nikdo z nich prostor naostro nepoužil.
--      Řádky zůstávají kvůli vazbám požadavků, zpráv a hodnocení.
--   3. Pozvánka **musí** být vázaná na e-mail. Nevázaná šla uplatnit komukoli,
--      kdo odkaz dostal přeposlaný (audit 2026-11-15). Staré nevázané pozvánky
--      se zruší a `redeem_invite` je odmítne.
--
-- Signatury funkcí se nemění, takže práva v `scripts/portal-grants.sql` platí
-- dál. Aditivní vůči starému buildu (Clerk): ten jen žádného člena nenajde.
--
-- Idempotentní.

COMMENT ON COLUMN portal.members.clerk_user_id IS
  'Id uživatele v Supabase Auth (od migrace 113, R-107). Název zůstal z doby Clerku.';

-- ─── 2. Členové z doby Clerku ────────────────────────────────────────────────
UPDATE portal.members
SET removed_at = now()
WHERE clerk_user_id LIKE 'user\_%' AND removed_at IS NULL;

-- ─── 3. Pozvánka jen s e-mailem ──────────────────────────────────────────────
UPDATE portal.invites
SET revoked_at = now()
WHERE email IS NULL AND used_at IS NULL AND revoked_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invites_email_required' AND conrelid = 'portal.invites'::regclass
  ) THEN
    -- NOT VALID: staré použité pozvánky bez e-mailu zůstanou, nové musí mít e-mail.
    ALTER TABLE portal.invites
      ADD CONSTRAINT invites_email_required CHECK (email IS NOT NULL) NOT VALID;
  END IF;
END
$$;

-- Uplatnění pozvánky: platná, nepoužitá, nezrušená, neprošlá, vázaná na e-mail
-- a shodná s e-mailem přihlášeného. Vrací client_id, jinak NULL. Atomické.
CREATE OR REPLACE FUNCTION portal.redeem_invite(p_code_hash text, p_clerk_user_id text, p_email text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  inv portal.invites%ROWTYPE;
  member_id uuid;
BEGIN
  IF p_code_hash IS NULL OR p_clerk_user_id IS NULL OR char_length(p_clerk_user_id) = 0
     OR p_email IS NULL OR char_length(btrim(p_email)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT i.* INTO inv
  FROM portal.invites i JOIN portal.clients c ON c.id = i.client_id
  WHERE i.code_hash = p_code_hash AND i.used_at IS NULL AND i.revoked_at IS NULL
    AND i.expires_at > now() AND c.archived_at IS NULL
  FOR UPDATE OF i;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF inv.email IS NULL OR lower(inv.email) <> lower(btrim(p_email)) THEN
    RETURN NULL;
  END IF;

  INSERT INTO portal.members (client_id, clerk_user_id, email, name, role)
  VALUES (inv.client_id, p_clerk_user_id, left(lower(btrim(p_email)), 320), left(p_name, 200), inv.role)
  ON CONFLICT (client_id, clerk_user_id) DO UPDATE
    SET removed_at = NULL, email = EXCLUDED.email, name = coalesce(EXCLUDED.name, portal.members.name)
  RETURNING id INTO member_id;

  UPDATE portal.invites SET used_at = now(), used_by = member_id WHERE id = inv.id;
  RETURN inv.client_id;
END
$$;

REVOKE ALL ON FUNCTION portal.redeem_invite(text, text, text, text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT EXECUTE ON FUNCTION portal.redeem_invite(text, text, text, text) TO portal_app;
  END IF;
END
$$;
