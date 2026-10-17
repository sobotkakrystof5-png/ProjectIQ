-- Migrace 084: Workspace — GDPR (S18, R-054)
--
-- 1. Výmaz zákazníka na žádost: ws.erase_customer() v jedné transakci smaže
--    zákazníka, jeho věrnost, hodnocení a zprávy z portálu, zbaví historii
--    (poptávky, termíny, zakázky) osobních údajů a nechá čísla (termíny,
--    částky, příjmy). Vystavené faktury zůstanou s povinnými údaji (zákonná
--    povinnost, GDPR čl. 17 odst. 3 písm. b), jen bez e-mailu; koncepty se
--    smažou. Po 10 letech od konce roku vystavení je anonymizuje denní cron
--    (ws.anonymize_expired_invoices).
-- 2. Zrušení účtu: ws.close_account() archivuje byznysy (tím zmizí objednávací
--    stránka, widget, API, portál i denní crony), zruší e-maily ve frontě
--    a nastaví výmaz za 30 dní. Do té doby jde účet obnovit
--    (ws.reopen_account). Denní cron pak účet smaže celý
--    (ws.purge_closed_accounts) — všechno ostatní na účet visí přes
--    ON DELETE CASCADE.
--
-- Funkce 1 a 2 běží jako volající (ws_app pod RLS), takže sáhnou jen na
-- vlastní účet. Funkce pro cron jsou SECURITY DEFINER a nic nepřijímají.
-- Idempotentní.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE ws.invoices ADD COLUMN IF NOT EXISTS anonymize_after date;
CREATE INDEX IF NOT EXISTS invoices_anonymize_idx ON ws.invoices (anonymize_after) WHERE anonymize_after IS NOT NULL;

ALTER TABLE ws.accounts ADD COLUMN IF NOT EXISTS closing_requested_at timestamptz;
ALTER TABLE ws.accounts ADD COLUMN IF NOT EXISTS delete_after timestamptz;
ALTER TABLE ws.accounts DROP CONSTRAINT IF EXISTS accounts_closing_check;
ALTER TABLE ws.accounts ADD CONSTRAINT accounts_closing_check
  CHECK ((closing_requested_at IS NULL) = (delete_after IS NULL));

-- Vrací počty změněných záznamů, nebo NULL, když zákazník v účtu není.
CREATE OR REPLACE FUNCTION ws.erase_customer(p_account uuid, p_customer uuid, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_requests uuid[];
  v_appointments uuid[];
  v_jobs uuid[];
  v_ids text[];
  v_invoices integer;
  v_drafts integer;
  v_messages integer;
BEGIN
  PERFORM 1 FROM ws.customers WHERE account_id = p_account AND id = p_customer FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_requests FROM ws.requests WHERE account_id = p_account AND customer_id = p_customer;
  SELECT COALESCE(array_agg(id), '{}') INTO v_appointments FROM ws.appointments WHERE account_id = p_account AND customer_id = p_customer;
  SELECT COALESCE(array_agg(id), '{}') INTO v_jobs FROM ws.jobs WHERE account_id = p_account AND customer_id = p_customer;
  v_ids := ARRAY[p_customer::text] || v_requests::text[] || v_appointments::text[] || v_jobs::text[];

  -- Historie bez osobních údajů; termíny, služby a částky zůstávají.
  UPDATE ws.requests SET contact = jsonb_build_object('name', 'Smazaný zákazník'), field_values = '{}'::jsonb, message = NULL
  WHERE account_id = p_account AND id = ANY (v_requests);
  UPDATE ws.appointments SET note = NULL, public_token = gen_random_uuid()
  WHERE account_id = p_account AND id = ANY (v_appointments);
  UPDATE ws.jobs SET field_values = '{}'::jsonb, portal_enabled = false, public_token = gen_random_uuid()
  WHERE account_id = p_account AND id = ANY (v_jobs);
  DELETE FROM ws.job_updates WHERE account_id = p_account AND job_id = ANY (v_jobs);
  DELETE FROM ws.reviews WHERE account_id = p_account
    AND (customer_id = p_customer OR job_id = ANY (v_jobs) OR appointment_id = ANY (v_appointments));
  DELETE FROM ws.action_tokens WHERE account_id = p_account AND request_id = ANY (v_requests);

  -- Zvonek a e-maily, které zákazníka zmiňují (odkaz nebo klíč nese id).
  DELETE FROM ws.notifications n WHERE n.account_id = p_account AND n.link IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE position(x IN n.link) > 0);
  DELETE FROM ws.outbound_messages m WHERE m.account_id = p_account
    AND (m.customer_id = p_customer
      OR (m.dedupe_key IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE position(x IN m.dedupe_key) > 0)));
  GET DIAGNOSTICS v_messages = ROW_COUNT;

  -- Faktury: koncepty pryč, vystavené zůstanou s povinnými údaji (bez e-mailu)
  -- a po 10 letech od konce roku vystavení se anonymizují úplně.
  DELETE FROM ws.invoices WHERE account_id = p_account AND customer_id = p_customer AND direction = 'issued' AND status = 'draft';
  GET DIAGNOSTICS v_drafts = ROW_COUNT;
  UPDATE ws.invoices SET
    counterparty = CASE WHEN counterparty ? 'email' THEN jsonb_set(counterparty, '{email}', '""') ELSE counterparty END,
    anonymize_after = make_date(extract(year FROM COALESCE(issued_on, created_at::date))::int + 11, 1, 1)
  WHERE account_id = p_account AND customer_id = p_customer AND direction = 'issued';
  GET DIAGNOSTICS v_invoices = ROW_COUNT;

  -- Zákazník pryč: věrnost a skupiny kaskádou, zbytek historie dostane NULL.
  DELETE FROM ws.customers WHERE account_id = p_account AND id = p_customer;

  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id, details)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'customer.erase', 'customer', p_customer,
    jsonb_build_object('requests', cardinality(v_requests), 'appointments', cardinality(v_appointments),
      'jobs', cardinality(v_jobs), 'invoices_kept', v_invoices, 'drafts_deleted', v_drafts, 'messages_deleted', v_messages));

  RETURN jsonb_build_object('requests', cardinality(v_requests), 'appointments', cardinality(v_appointments),
    'jobs', cardinality(v_jobs), 'invoices_kept', v_invoices, 'drafts_deleted', v_drafts);
END
$$;

-- Denní cron: faktury vymazaných zákazníků po uplynutí lhůty.
CREATE OR REPLACE FUNCTION ws.anonymize_expired_invoices()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE ws.invoices SET
    counterparty = jsonb_build_object('name', 'Anonymizováno', 'address', '-', 'ico', '', 'dic', '', 'email', '', 'bank', ''),
    note = NULL, pdf_data = NULL, pdf_filename = NULL, anonymize_after = NULL
  WHERE anonymize_after IS NOT NULL AND anonymize_after <= current_date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

-- 2 ---------------------------------------------------------------------------
-- Vrací den výmazu; opakované volání lhůtu neprodlouží.
CREATE OR REPLACE FUNCTION ws.close_account(p_account uuid, p_actor text)
RETURNS timestamptz
LANGUAGE plpgsql AS $$
DECLARE
  v_at timestamptz;
  v_delete timestamptz;
BEGIN
  SELECT closing_requested_at, delete_after INTO v_at, v_delete FROM ws.accounts WHERE id = p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_delete IS NOT NULL THEN RETURN v_delete; END IF;

  v_at := now();
  v_delete := v_at + interval '30 days';
  UPDATE ws.accounts SET closing_requested_at = v_at, delete_after = v_delete WHERE id = p_account;
  -- Stejný čas archivace jako žádost: obnovení vrátí jen tyhle byznysy.
  UPDATE ws.businesses SET archived_at = v_at WHERE account_id = p_account AND archived_at IS NULL;
  UPDATE ws.outbound_messages SET status = 'cancelled' WHERE account_id = p_account AND status IN ('queued', 'sending');
  DELETE FROM ws.action_tokens WHERE account_id = p_account;

  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id, details)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'account.close', 'account', p_account, jsonb_build_object('delete_after', v_delete));
  RETURN v_delete;
END
$$;

-- false, když účet není ve lhůtě (už smazaný nebo se neruší).
CREATE OR REPLACE FUNCTION ws.reopen_account(p_account uuid, p_actor text)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE v_at timestamptz;
BEGIN
  SELECT closing_requested_at INTO v_at FROM ws.accounts WHERE id = p_account AND delete_after > now() FOR UPDATE;
  IF v_at IS NULL THEN RETURN false; END IF;
  UPDATE ws.businesses SET archived_at = NULL WHERE account_id = p_account AND archived_at = v_at;
  UPDATE ws.accounts SET closing_requested_at = NULL, delete_after = NULL WHERE id = p_account;
  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'account.reopen', 'account', p_account);
  RETURN true;
END
$$;

-- Denní cron: smaže účty po lhůtě. Vrací, co ještě uklidit mimo DB (Clerk).
CREATE OR REPLACE FUNCTION ws.purge_closed_accounts()
RETURNS TABLE (account_id uuid, clerk_org_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  DELETE FROM ws.accounts a WHERE a.delete_after IS NOT NULL AND a.delete_after <= now()
  RETURNING a.id, a.clerk_org_id
$$;

REVOKE ALL ON FUNCTION ws.anonymize_expired_invoices() FROM PUBLIC;
REVOKE ALL ON FUNCTION ws.purge_closed_accounts() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.anonymize_expired_invoices() TO ws_app;
    GRANT EXECUTE ON FUNCTION ws.purge_closed_accounts() TO ws_app;
  END IF;
END
$$;
