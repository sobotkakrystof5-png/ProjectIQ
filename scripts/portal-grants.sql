-- Práva role portal_app na schéma portal (KP05). Idempotentní, pouští se po
-- migracích 095+ rolí, která migrace pouští (vlastník tabulek):
--   node scripts/portal-create-role.js
--
-- portal_app nedostává NIC ve schématu public. Projekce zakázek a zpráv jen čte,
-- členy čte, pozvánky nevidí vůbec (uplatní je jen funkce redeem_invite).
-- Tenhle soubor nemá bloky DO $$, skript ho dělí podle středníků.

GRANT USAGE ON SCHEMA portal TO portal_app;

GRANT SELECT ON portal.clients, portal.members, portal.projects, portal.activity TO portal_app;
REVOKE ALL ON portal.invites FROM portal_app;

GRANT EXECUTE ON FUNCTION portal.current_client() TO portal_app;
GRANT EXECUTE ON FUNCTION portal.member_lookup(text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.redeem_invite(text, text, text, text) TO portal_app;

-- Požadavky, zprávy a hodnocení (migrace 096, KP07). Zapisuje se jen funkcemi
-- (limity, kontrola členství), tabulky portal_app jen čte.
GRANT SELECT ON portal.requests, portal.messages, portal.feedback TO portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_request(uuid, uuid, text, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_message(uuid, uuid, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_feedback(uuid, uuid, integer, text) TO portal_app;

-- Etapy a úkoly zakázky (migrace 121, KP12). Klient je jen čte a úkol označí
-- funkcí submit_task_state; záznam o označení (task_marks) nevidí.
GRANT SELECT ON portal.phases, portal.phase_tasks TO portal_app;
REVOKE ALL ON portal.task_marks FROM portal_app;
GRANT EXECUTE ON FUNCTION portal.submit_task_state(uuid, uuid, boolean) TO portal_app;

-- Peníze a faktury zakázky (migrace 122, KP13). Klient je jen čte; nahrané PDF
-- archivní faktury vydá jen funkce invoice_pdf (členství, jedna faktura).
GRANT SELECT ON portal.project_money, portal.invoices TO portal_app;
GRANT EXECUTE ON FUNCTION portal.invoice_pdf(uuid, uuid) TO portal_app;

-- Konzultace z volna (migrace 123, KP14). Klient čte jen své konzultace
-- a volné časy (bez toho, čím je zbytek obsazený); rezervuje, přesouvá
-- a ruší jen funkcemi (členství, lhůta 24 h, limity).
GRANT SELECT ON portal.consultations TO portal_app;
GRANT EXECUTE ON FUNCTION portal.free_consultation_slots(timestamptz, timestamptz) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.book_consultation(uuid, uuid, timestamptz, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.move_consultation(uuid, uuid, timestamptz) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.cancel_consultation(uuid, uuid) TO portal_app;

-- Chat s klientem (migrace 124, KP15). Zprávy klient píše jen funkcemi
-- (limity, příloha jen do vlastní složky). Ze stavu vlákna smí číst jen
-- „přečteno" — kdy byl admin naposledy aktivní, klient nevidí (D-K19).
-- Cestu k souboru přílohy nevidí; soubor vydá jen attachment_file.
GRANT SELECT (project_id, client_id, side, last_read_at, last_read_member) ON portal.thread_state TO portal_app;
GRANT SELECT (id, client_id, project_id, message_id, mime, size_bytes, filename, created_at) ON portal.message_attachments TO portal_app;
GRANT EXECUTE ON FUNCTION portal.post_message(uuid, uuid, text, text, uuid, jsonb) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.answer_approval(uuid, uuid, text, text) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.touch_thread(uuid, uuid, boolean) TO portal_app;
GRANT EXECUTE ON FUNCTION portal.attachment_file(uuid, uuid) TO portal_app;

-- Přehled klienta (migrace 125, KP16). Hodnocení jde přes dotazník R-119:
-- funkce vrátí členovi token dotazníku jeho hotových zakázek a stav odpovědi.
GRANT EXECUTE ON FUNCTION portal.client_surveys(uuid) TO portal_app;

-- Poptávky z webu klienta (migrace 126, KP17). Klient čte jen měsíční součty
-- svých zakázek; k událostem ani klíčům webu přístup nemá.
GRANT EXECUTE ON FUNCTION portal.web_lead_months(uuid) TO portal_app;
