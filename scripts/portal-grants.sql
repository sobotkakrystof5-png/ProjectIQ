-- Práva role portal_app na schéma portal (KP05). Idempotentní, pouští se po
-- migracích 095+ (od R-080 i 101) rolí, která migrace pouští (vlastník tabulek):
--   node scripts/portal-create-role.js
--
-- portal_app nedostává NIC ve schématu public. Projekce zakázek a zpráv jen čte,
-- členy čte, pozvánky nevidí vůbec (uplatní je jen funkce redeem_invite_for_user).
-- Tenhle soubor nemá bloky DO $$, skript ho dělí podle středníků.

GRANT USAGE ON SCHEMA portal TO portal_app;

GRANT SELECT ON portal.clients, portal.members, portal.projects, portal.activity TO portal_app;
REVOKE ALL ON portal.invites FROM portal_app;

GRANT EXECUTE ON FUNCTION portal.current_client() TO portal_app;
-- Přihlášení přes Supabase Auth (migrace 101, R-080). Starší member_lookup a
-- redeem_invite (Clerk) portal_app nedostává.
GRANT EXECUTE ON FUNCTION portal.memberships_for_user(text) TO portal_app;
-- Platnost relace a zapnuté 2FA (migrace 104, R-081).
GRANT EXECUTE ON FUNCTION portal.auth_state(text, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.redeem_invite_for_user(text, text, text, text) TO portal_app;
REVOKE EXECUTE ON FUNCTION portal.member_lookup(text) FROM portal_app;
REVOKE EXECUTE ON FUNCTION portal.redeem_invite(text, text, text, text) FROM portal_app;

-- Požadavky, zprávy a hodnocení (migrace 096, KP07). Zapisuje se jen funkcemi
-- (limity, kontrola členství), tabulky portal_app jen čte.
GRANT SELECT ON portal.requests, portal.messages, portal.feedback TO portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_request(uuid, uuid, text, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_message(uuid, uuid, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_feedback(uuid, uuid, integer, text) TO portal_app;
