-- 104: stav přihlášení pro klientský prostor — totéž co ws.auth_state (103),
-- jen pro roli portal_app, která do schématu ws nevidí. (R-081)
-- Mimo Supabase (testy) vrací (true, false). Idempotentní.

CREATE OR REPLACE FUNCTION portal.auth_state(p_user_id text, p_session_id text)
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

REVOKE ALL ON FUNCTION portal.auth_state(text, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT EXECUTE ON FUNCTION portal.auth_state(text, text) TO portal_app;
  END IF;
END
$$;
