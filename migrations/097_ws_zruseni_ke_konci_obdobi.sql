-- 097: Zrušení účtu ke konci zaplaceného období (D5, R-074).
--
-- Dřív ws.close_account() běželo hned po žádosti a předplatné ve Stripe
-- skončilo okamžitě. Teď si účet žádost jen poznamená (close_scheduled_at),
-- předplatné běží do konce zaplaceného období (cancel_at_period_end ve Stripe)
-- a teprve když už žádné živé předplatné nemá, zavolá se ws.close_account()
-- a začne 30denní lhůta. Dokončení spouští synchronizace předplatného
-- (webhook Stripe) a záložně denní cron ws-gdpr.
--
-- Funkce pro účet běží jako volající (ws_app pod RLS). Seznam pro cron je
-- SECURITY DEFINER a nic nepřijímá. Idempotentní.

ALTER TABLE ws.accounts ADD COLUMN IF NOT EXISTS close_scheduled_at timestamptz;

-- Stejné jako v 084, navíc zruší naplánování (účet je už zavřený).
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
  UPDATE ws.accounts SET closing_requested_at = v_at, delete_after = v_delete, close_scheduled_at = NULL WHERE id = p_account;
  -- Stejný čas archivace jako žádost: obnovení vrátí jen tyhle byznysy.
  UPDATE ws.businesses SET archived_at = v_at WHERE account_id = p_account AND archived_at IS NULL;
  UPDATE ws.outbound_messages SET status = 'cancelled' WHERE account_id = p_account AND status IN ('queued', 'sending');
  DELETE FROM ws.action_tokens WHERE account_id = p_account;

  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id, details)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'account.close', 'account', p_account, jsonb_build_object('delete_after', v_delete));
  RETURN v_delete;
END
$$;

-- false, když je účet už zavřený (běží lhůta) nebo neexistuje.
CREATE OR REPLACE FUNCTION ws.schedule_close_account(p_account uuid, p_actor text)
RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ws.accounts SET close_scheduled_at = COALESCE(close_scheduled_at, now())
  WHERE id = p_account AND delete_after IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'account.close_scheduled', 'account', p_account);
  RETURN true;
END
$$;

-- false, když zrušení naplánované nebylo.
CREATE OR REPLACE FUNCTION ws.unschedule_close_account(p_account uuid, p_actor text)
RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ws.accounts SET close_scheduled_at = NULL
  WHERE id = p_account AND close_scheduled_at IS NOT NULL AND delete_after IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'account.close_unscheduled', 'account', p_account);
  RETURN true;
END
$$;

-- Po synchronizaci předplatného: když účet čeká na zavření a žádné předplatné
-- už nic neúčtuje, zavře ho. Když předplatné znovu běží bez konce (obnovené
-- v Portalu Stripe), naplánování zruší. Vrací konec lhůty, nebo NULL.
CREATE OR REPLACE FUNCTION ws.finish_scheduled_close(p_account uuid)
RETURNS timestamptz
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM ws.accounts WHERE id = p_account AND close_scheduled_at IS NOT NULL AND delete_after IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM ws.subscriptions WHERE account_id = p_account
             AND status IN ('trialing', 'active') AND NOT cancel_at_period_end) THEN
    PERFORM ws.unschedule_close_account(p_account, 'system');
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM ws.subscriptions WHERE account_id = p_account
             AND status IN ('trialing', 'active', 'past_due', 'unpaid', 'paused', 'incomplete')) THEN
    RETURN NULL;
  END IF;

  RETURN ws.close_account(p_account, 'system');
END
$$;

-- Denní cron: účty čekající na zavření a jejich předplatná k obnovení ze Stripe.
CREATE OR REPLACE FUNCTION ws.scheduled_closings()
RETURNS TABLE (account_id uuid, subscription_ids text[])
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT a.id,
         COALESCE(array_agg(s.stripe_subscription_id) FILTER (WHERE s.stripe_subscription_id IS NOT NULL), '{}')
  FROM ws.accounts a
  LEFT JOIN ws.subscriptions s ON s.account_id = a.id
    AND s.status IN ('trialing', 'active', 'past_due', 'unpaid', 'paused', 'incomplete')
  WHERE a.close_scheduled_at IS NOT NULL AND a.delete_after IS NULL
  GROUP BY a.id
$$;

REVOKE ALL ON FUNCTION ws.scheduled_closings() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.scheduled_closings() TO ws_app;
  END IF;
END
$$;
