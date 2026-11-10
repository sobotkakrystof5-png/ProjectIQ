-- Migrace 102: zavřít Supabase Data API nad tabulkami aplikace (R-080)
--
-- Aplikace čte a zapisuje jen přes přímé spojení s Postgresem (lib/pg.ts) rolemi
-- postgres, ws_app a portal_app. Supabase ale schéma public navíc vystavuje přes
-- REST/GraphQL rolím anon a authenticated — s veřejným klíčem z prohlížeče by
-- kdokoli četl a měnil admin data. Proto:
--
--   1. RLS na každé tabulce v public (bez politik = anon/authenticated nic;
--      postgres jako vlastník RLS obchází, aplikace funguje dál),
--   2. odebrat anon a authenticated práva na tabulky, sekvence a funkce v public
--      i pro objekty, které teprve vzniknou,
--   3. SECURITY DEFINER funkce v public nesmí volat PUBLIC (RPC přes Data API).
--
-- Schémata ws a portal Data API nevystavuje a anon do nich nemá USAGE.
-- Doporučení navíc: Supabase → Project Settings → Data API → vypnout úplně.
--
-- Mimo Supabase (lokální Postgres, PGlite) role anon neexistuje a migrace nic
-- nedělá. Idempotentní. Nové tabulky v public si RLS zapínají samy (AGENTS.md).

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE '102: role anon/authenticated neexistují (nejde o Supabase), přeskočeno';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tbl);
  END LOOP;

  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
  END LOOP;
END
$$;
