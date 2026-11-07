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

-- Denní cron skupin zákazníků a věrnosti (migrace 077, S12)
GRANT EXECUTE ON FUNCTION ws.active_businesses() TO ws_app;

-- E-maily, odkazy a novinky (migrace 081, S15). Novinky píše jen admin.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ws.product_news FROM ws_app;
GRANT EXECUTE ON FUNCTION ws.accounts_with_due_messages() TO ws_app;

-- Klientský portál (migrace 082, S16)
GRANT EXECUTE ON FUNCTION ws.portal_lookup(uuid) TO ws_app;

-- Admin konzole: poznámky k účtům klientů (migrace 083, S17). Interní, ws_app nic.
REVOKE ALL ON ws.account_admin_notes FROM ws_app;

-- GDPR: denní úklid faktur a zrušených účtů (migrace 084, S18)
GRANT EXECUTE ON FUNCTION ws.anonymize_expired_invoices() TO ws_app;
GRANT EXECUTE ON FUNCTION ws.purge_closed_accounts() TO ws_app;
-- Zrušení ke konci zaplaceného období (migrace 097, R-074)
GRANT EXECUTE ON FUNCTION ws.scheduled_closings() TO ws_app;

-- Peníze (migrace 080 a 088). Od RD02 předpokládá skript migrace 064–091 (od R-074 i 097);
-- ws-create-role.js dělí soubor podle středníků, bloky DO $$ sem nepatří.
GRANT EXECUTE ON FUNCTION ws.money_issue(uuid,jsonb), ws.money_adopt_visit() TO ws_app;
GRANT EXECUTE ON FUNCTION ws.money_pay(uuid,uuid,date,text), ws.money_unpay(uuid,uuid) TO ws_app;

-- Kontext byznysu jedním dotazem (migrace 085, RD02)
GRANT EXECUTE ON FUNCTION ws.business_scope(text, text) TO ws_app;
