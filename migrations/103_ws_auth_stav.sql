-- 103: stav přihlášení pro Workspace — platí ještě relace a má člověk zapnuté
-- dvoufázové ověření? (R-081)
--
-- Proč v databázi: JWT v cookie se ověřuje jen podpisem (getClaims, bez dotazu
-- na Auth server), takže by po „Odhlásit všude“ platil ještě do vypršení
-- a o zapnutém 2FA nic neříká. Tabulky auth.sessions a auth.mfa_factors jsou
-- ve stejné databázi; funkce je čte jedním krátkým dotazem a ws_app do schématu
-- auth jinak nevidí.
--
-- Mimo Supabase (testy, PGlite) schéma auth není: funkce vrátí (true, false),
-- tj. relace platí a 2FA není — chování jako před R-081. Idempotentní.

CREATE OR REPLACE FUNCTION ws.auth_state(p_user_id text, p_session_id text)
RETURNS TABLE (session_ok boolean, mfa_enrolled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  uid uuid;
  sid uuid;
BEGIN
  IF to_regclass('auth.sessions') IS NULL OR to_regclass('auth.mfa_factors') IS NULL THEN
    RETURN QUERY SELECT true, false;
    RETURN;
  END IF;
  BEGIN
    uid := p_user_id::uuid;
    sid := p_session_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END;
  RETURN QUERY SELECT
    EXISTS (
      SELECT 1 FROM auth.sessions s
      WHERE s.id = sid AND s.user_id = uid AND (s.not_after IS NULL OR s.not_after > now())
    ),
    EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = uid AND f.status = 'verified'
    );
END
$$;

REVOKE ALL ON FUNCTION ws.auth_state(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.auth_state(text, text) TO ws_app;
  END IF;
END
$$;
