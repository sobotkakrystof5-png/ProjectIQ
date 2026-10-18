-- Migrace 085: Workspace — kontext navigace jedním dotazem (RD02, R-058)
--
-- Dnes obrazovka byznysu dělá tři dotazy za sebou, než začne číst data:
-- ws.account_by_clerk_org → byznys podle slugu ∥ předplatné → zapnuté funkce
-- a byznysy pro přepínač. Každý dotaz je samostatný HTTP požadavek do Neonu.
-- ws.business_scope() vrátí totéž v jednom kole: účet, byznys z URL, předplatné,
-- zapnuté funkce a byznysy účtu pro přepínač.
--
-- Stejný vzor jako ws.account_by_clerk_org (R-035): SECURITY DEFINER s pevným
-- search_path, protože pod RLS by bez nastaveného účtu nic neviděla. Klíčem je
-- Clerk organizace (ověřená přihlášením), takže funkce vrátí data nejvýš jednoho
-- účtu. Neznámá organizace → NULL. Cizí, archivovaný nebo neexistující slug →
-- klíč "business" je null (aplikace z toho udělá 404, nikdy 403).
-- Idempotentní (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION ws.business_scope(org_id text, business_slug text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'account_id', a.id,
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
  FROM ws.accounts a
  WHERE a.clerk_org_id = org_id
$$;

REVOKE ALL ON FUNCTION ws.business_scope(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.business_scope(text, text) TO ws_app;
  END IF;
END
$$;
