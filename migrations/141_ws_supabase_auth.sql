-- Migrace 141: Workspace přihlášení přes Supabase Auth místo Clerku (R-154, F2 plánu
-- docs/AUTH-SUPABASE-PLAN.md)
--
-- Clerk držel účet jako „organizaci" a roli člena. Od teď je účet a členství jen
-- v Neonu: kdo je člověk, řekne podepsaný token Supabase (id uživatele), ke kterému
-- účtu patří a s jakou rolí, řekne ws.members. Data zůstávají v Neonu (R-002).
--
-- Co se mění:
--   * ws.members.clerk_user_id nese id uživatele v Supabase. Název zůstává stejně
--     jako u portal.members (migrace 113): přejmenování by rozbilo opakovaný běh
--     migrace 064, jejíž funkce na sloupec odkazují. Staré řádky z Clerku (user_…)
--     už nikoho nepustí, protože takové id Supabase nevydá.
--   * ws.accounts.clerk_org_id už není povinný (nové účty organizaci nemají).
--   * Jeden člověk vlastní nejvýš jeden účet (R-026); hlídá to částečný unikátní
--     index, takže dvojklik v průvodci nezaloží dva účty.
--   * ws.member_account() a ws.business_scope_for_user() nahrazují funkce podle
--     organizace Clerku (ws.account_by_clerk_org, ws.business_scope). Staré zůstávají
--     kvůli opakovanému běhu starších migrací, aplikace je nevolá.
--   * ws.account_invites: pozvánka vlastníka do účtu, který založil admin (S17).
--     Kód zná jen klient z e-mailu, v DB je HMAC (lib/ws/invite.ts).
--   * ws.signup_permits: krátké povolení k registraci z landing page; hook Supabase
--     („Before User Created") pustí účet jen s ním nebo s pozvánkou.
--   * ws.purge_closed_accounts_with_members(): úklid zrušených účtů vrací i id
--     uživatelů, aby cron mohl smazat přístup v Supabase, když už ho nikde nepotřebují.
--
-- Idempotentní (IF NOT EXISTS, CREATE OR REPLACE). Kompatibilní se starým buildem:
-- ten dál čte přes clerk_org_id a nové objekty nezná.

ALTER TABLE ws.accounts ALTER COLUMN clerk_org_id DROP NOT NULL;

COMMENT ON COLUMN ws.members.clerk_user_id IS
  'Id uživatele v Supabase Auth (od migrace 141, R-154). Starší hodnoty user_… jsou z Clerku a nikoho nepustí.';
COMMENT ON COLUMN ws.accounts.clerk_org_id IS
  'Organizace Clerku z doby před migrací 141. Nové účty ji nemají a aplikace ji nečte.';

CREATE INDEX IF NOT EXISTS members_user_idx ON ws.members (clerk_user_id);

-- Jeden vlastněný účet na člověka (R-026). Dvojklik v průvodci = unikátní kolize
-- a aplikace vrátí ten první účet.
CREATE UNIQUE INDEX IF NOT EXISTS members_one_owner_per_user
  ON ws.members (clerk_user_id) WHERE role = 'owner';

-- Účet přihlášeného člověka: vlastněný má přednost, pak nejstarší členství.
CREATE OR REPLACE FUNCTION ws.member_account(user_id text)
RETURNS TABLE (account_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.account_id, m.role
  FROM ws.members m
  JOIN ws.accounts a ON a.id = m.account_id
  WHERE m.clerk_user_id = user_id AND char_length(user_id) > 0
  ORDER BY (m.role = 'owner') DESC, m.created_at, m.id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ws.member_account(text) FROM PUBLIC;

-- Kontext obrazovky byznysu jedním dotazem (stejný tvar jako ws.business_scope
-- z migrace 085, navíc role). Účet se vybere podle členství: ten, ve kterém je
-- byznys z URL, jinak vlastněný, jinak nejstarší. Slug je napříč účty unikátní,
-- takže cizí byznys se sem nikdy nedostane — "business" je pak null (= 404).
CREATE OR REPLACE FUNCTION ws.business_scope_for_user(user_id text, business_slug text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH mem AS (
    SELECT m.account_id, m.role
    FROM ws.members m
    JOIN ws.accounts a ON a.id = m.account_id
    WHERE m.clerk_user_id = user_id AND char_length(user_id) > 0
    ORDER BY EXISTS (
        SELECT 1 FROM ws.businesses b
        WHERE b.account_id = m.account_id AND b.slug = business_slug AND b.archived_at IS NULL
      ) DESC,
      (m.role = 'owner') DESC, m.created_at, m.id
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'account_id', mem.account_id,
    'role', mem.role,
    'business', (
      SELECT to_jsonb(b) FROM (
        SELECT id, account_id, name, slug, industry, color, logo_url, timezone, settings, archived_at
        FROM ws.businesses
        WHERE account_id = mem.account_id AND slug = business_slug AND archived_at IS NULL
      ) b
    ),
    'businesses', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'slug', x.slug) ORDER BY x.created_at), '[]'::jsonb)
      FROM ws.businesses x
      WHERE x.account_id = mem.account_id AND x.archived_at IS NULL
    ),
    'modules', (
      SELECT coalesce(jsonb_agg(m.module), '[]'::jsonb)
      FROM ws.business_modules m
      JOIN ws.businesses cur ON cur.id = m.business_id AND cur.account_id = m.account_id
      WHERE m.account_id = mem.account_id AND m.enabled
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
      WHERE s.account_id = mem.account_id
    )
  )
  FROM mem
$$;

REVOKE ALL ON FUNCTION ws.business_scope_for_user(text, text) FROM PUBLIC;

-- Pozvánka vlastníka do účtu založeného adminem (S17). Kód je jednorázový,
-- vázaný na e-mail a platí 14 dní; v DB jen HMAC.
CREATE TABLE IF NOT EXISTS ws.account_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 320),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id)
);

CREATE INDEX IF NOT EXISTS account_invites_account_idx ON ws.account_invites (account_id, created_at DESC);

SELECT ws.enable_account_rls('ws.account_invites');
SELECT ws.add_touch_trigger('ws.account_invites');

-- Co ukázat na stránce pozvánky, než je člověk přihlášený (účet ještě nezná).
CREATE OR REPLACE FUNCTION ws.account_invite_preview(p_code_hash text)
RETURNS TABLE (email text, business_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT i.email,
         (SELECT b.name FROM ws.businesses b
          WHERE b.account_id = i.account_id AND b.archived_at IS NULL
          ORDER BY b.created_at LIMIT 1)
  FROM ws.account_invites i
  JOIN ws.accounts a ON a.id = i.account_id
  WHERE i.code_hash = p_code_hash AND i.used_at IS NULL AND i.revoked_at IS NULL
    AND i.expires_at > now() AND a.delete_after IS NULL
$$;

REVOKE ALL ON FUNCTION ws.account_invite_preview(text) FROM PUBLIC;

-- Uplatnění pozvánky: zamkne ji, ověří e-mail přihlášeného a zapíše člena.
-- Vrací účet, nebo NULL (neplatná, prošlá, cizí e-mail). Kolize „už vlastníte
-- jiný účet" proletí jako 23505 (members_one_owner_per_user) — aplikace ji
-- převede na českou hlášku.
CREATE OR REPLACE FUNCTION ws.redeem_account_invite(p_code_hash text, p_user_id text, p_email text, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  inv ws.account_invites%ROWTYPE;
BEGIN
  IF p_code_hash IS NULL OR p_user_id IS NULL OR char_length(p_user_id) = 0
     OR p_email IS NULL OR char_length(btrim(p_email)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT i.* INTO inv
  FROM ws.account_invites i JOIN ws.accounts a ON a.id = i.account_id
  WHERE i.code_hash = p_code_hash AND i.used_at IS NULL AND i.revoked_at IS NULL
    AND i.expires_at > now() AND a.delete_after IS NULL
  FOR UPDATE OF i;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF lower(inv.email) <> lower(btrim(p_email)) THEN
    RETURN NULL;
  END IF;

  INSERT INTO ws.members (account_id, clerk_user_id, role, name, email)
  VALUES (inv.account_id, p_user_id, inv.role, left(p_name, 200), left(lower(btrim(p_email)), 320))
  ON CONFLICT (account_id, clerk_user_id) DO UPDATE
    SET role = CASE WHEN EXCLUDED.role = 'owner' THEN 'owner' ELSE ws.members.role END,
        email = EXCLUDED.email,
        name = coalesce(EXCLUDED.name, ws.members.name);

  -- Ostatní otevřené pozvánky téhož účtu už nejsou potřeba.
  UPDATE ws.account_invites SET used_at = now(), used_by = p_user_id WHERE id = inv.id;
  UPDATE ws.account_invites SET revoked_at = now()
  WHERE account_id = inv.account_id AND id <> inv.id AND used_at IS NULL AND revoked_at IS NULL;
  RETURN inv.account_id;
END
$$;

REVOKE ALL ON FUNCTION ws.redeem_account_invite(text, text, text, text) FROM PUBLIC;

-- Povolení k registraci z landing page (otevře se, až bude registrace spuštěná).
-- Bez RLS jako ws.rate_limits: účet ještě neexistuje. Stejně jako tam ani tady
-- nic čitelného: místo e-mailu jen HMAC s pepřem (address_digest), jméno jde
-- rovnou do Supabase. Maže se po ověření kódu a denně po vypršení (cron ws-gdpr).
CREATE TABLE IF NOT EXISTS ws.signup_permits (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  address_digest text NOT NULL CHECK (address_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signup_permits_address_idx ON ws.signup_permits (address_digest);

CREATE INDEX IF NOT EXISTS signup_permits_expiry_idx ON ws.signup_permits (expires_at);

-- Úklid zrušených účtů po lhůtě (stejně jako ws.purge_closed_accounts z 091),
-- navíc s id uživatelů, kteří v účtu byli — cron jim smaže přístup v Supabase,
-- pokud ho nepotřebují jinde (jiný účet, klientský prostor, admin).
CREATE OR REPLACE FUNCTION ws.purge_closed_accounts_with_members()
RETURNS TABLE (purged_account_id uuid, member_user_ids text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  DELETE FROM ws.sessions se
  USING ws.accounts a
  WHERE se.account_id = a.id AND a.delete_after IS NOT NULL AND a.delete_after <= now();

  RETURN QUERY
    WITH doomed AS (
      SELECT a.id AS aid,
             coalesce(array_agg(m.clerk_user_id) FILTER (WHERE m.clerk_user_id IS NOT NULL), '{}'::text[]) AS users
      FROM ws.accounts a
      LEFT JOIN ws.members m ON m.account_id = a.id
      WHERE a.delete_after IS NOT NULL AND a.delete_after <= now()
      GROUP BY a.id
    ), del AS (
      DELETE FROM ws.accounts a USING doomed d WHERE a.id = d.aid RETURNING a.id AS aid
    )
    SELECT del.aid, doomed.users FROM del JOIN doomed ON doomed.aid = del.aid;
END
$$;

REVOKE ALL ON FUNCTION ws.purge_closed_accounts_with_members() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.member_account(text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.business_scope_for_user(text, text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.account_invite_preview(text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.redeem_account_invite(text, text, text, text) TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.purge_closed_accounts_with_members() TO ws_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ws.account_invites TO ws_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ws.signup_permits TO ws_app;
  END IF;
END
$$;
