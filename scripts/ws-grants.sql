-- Práva role ws_app na schéma ws (S06). Idempotentní, pouští se po migracích
-- 064+ rolí, která migrace pouští (vlastník tabulek):
--   node scripts/ws-create-role.js          (založí roli a pustí tenhle soubor)
--   nebo ručně v Neon SQL editoru
--
-- ws_app nedostává nic ve schématu public — admin data nevidí. Vlastník
-- tabulek (admin) RLS nepodléhá a ws čte bez dalšího grantu (/dashboard/klienti).

GRANT USAGE ON SCHEMA ws TO ws_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ws TO ws_app;

-- Audit jen zapisovat a číst, nikdy přepisovat.
REVOKE UPDATE, DELETE, TRUNCATE ON ws.audit_log FROM ws_app;

GRANT EXECUTE ON FUNCTION ws.account_by_clerk_org(text) TO ws_app;

-- Veřejné API, objednávací stránka a widget (migrace 076, S11)
GRANT EXECUTE ON FUNCTION ws.integration_by_public_key(text) TO ws_app;
GRANT EXECUTE ON FUNCTION ws.integration_by_secret_prefix(text) TO ws_app;
GRANT EXECUTE ON FUNCTION ws.business_by_public_slug(text) TO ws_app;

-- Tabulky z dalších migrací dostanou stejná práva samy. Audit-like tabulky
-- v budoucích migracích si REVOKE dělají samy.
ALTER DEFAULT PRIVILEGES IN SCHEMA ws GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ws_app;
