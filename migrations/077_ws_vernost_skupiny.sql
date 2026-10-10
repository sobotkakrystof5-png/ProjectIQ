-- Migrace 077: Workspace — věrnost, skupiny zákazníků, „Komu napsat“ (S12, R-046)
--
-- 1. outbound_messages.status 'draft': „Komu napsat“ připraví zprávu jako
--    koncept, odesílat ji bude až fronta e-mailů (S15).
-- 2. loyalty_events.job_id + for_day: razítko za dokončenou zakázku (jedna
--    zakázka = nejvýš jedno razítko, hlídá DB) a den návštěvy pro pravidlo
--    „nejvýš 1 razítko za den“ (počítá se den návštěvy, ne den zaplacení).
-- 3. ws.loyalty_add_stamps: přidání/odebrání razítek v jedné transakci se
--    zámkem na zákazníka × program (platnost karty, 1 denně, plná karta,
--    opakované zaplacení). SECURITY INVOKER — běží pod RLS jako ws_app.
-- 4. ws.merge_customers: sloučení duplicitního zákazníka do ponechaného.
--    Všechna data se přesunou, prázdný duplikát se smaže, záznam do audit_log.
-- 5. ws.active_businesses: SECURITY DEFINER seznam byznysů pro denní cron
--    /api/cron/ws-segments (cron nezná účet a pod RLS by neviděl nic).
--    Vrací jen identifikátory, žádná data zákazníků.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE ws.outbound_messages DROP CONSTRAINT IF EXISTS outbound_messages_status_check;
ALTER TABLE ws.outbound_messages ADD CONSTRAINT outbound_messages_status_check
  CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled'));

-- 2 ---------------------------------------------------------------------------
ALTER TABLE ws.loyalty_events ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE ws.loyalty_events ADD COLUMN IF NOT EXISTS for_day date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_events_job_fk') THEN
    ALTER TABLE ws.loyalty_events ADD CONSTRAINT loyalty_events_job_fk
      FOREIGN KEY (account_id, job_id) REFERENCES ws.jobs(account_id, id) ON DELETE SET NULL (job_id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_events_stamp_job_uq ON ws.loyalty_events (job_id) WHERE kind = 'stamp' AND job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loyalty_events_card_idx ON ws.loyalty_events (card_id, created_at DESC);

-- 3 ---------------------------------------------------------------------------
-- p_kind 'stamp' (automaticky po zaplacení / dokončení), 'manual' (ručně, s důvodem).
-- Vrací {result: added|duplicate|same_day|full|off|none, card_id, added, stamps, needed, status}.
CREATE OR REPLACE FUNCTION ws.loyalty_add_stamps(
  p_account uuid,
  p_business uuid,
  p_customer uuid,
  p_delta integer,
  p_day date,
  p_appointment uuid DEFAULT NULL,
  p_job uuid DEFAULT NULL,
  p_kind text DEFAULT 'stamp',
  p_reason text DEFAULT NULL,
  p_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  prog ws.loyalty_programs%ROWTYPE;
  card ws.loyalty_cards%ROWTYPE;
  v_delta integer := p_delta;
  v_new integer;
  v_add integer;
BEGIN
  IF p_kind NOT IN ('stamp', 'manual') THEN
    RAISE EXCEPTION 'loyalty_add_stamps: neznámý druh %', p_kind USING ERRCODE = '22023';
  END IF;
  IF v_delta IS NULL OR v_delta = 0 THEN
    RETURN jsonb_build_object('result', 'none');
  END IF;

  SELECT * INTO prog FROM ws.loyalty_programs WHERE account_id = p_account AND business_id = p_business;
  IF NOT FOUND OR NOT prog.enabled THEN
    RETURN jsonb_build_object('result', 'off');
  END IF;

  -- Souběžná razítka téhož zákazníka v tomhle programu jdou po jednom.
  PERFORM pg_advisory_xact_lock(hashtext('ws.loyalty:' || prog.id::text || ':' || p_customer::text));

  IF p_kind = 'stamp' AND (
    (p_appointment IS NOT NULL AND EXISTS (
      SELECT 1 FROM ws.loyalty_events WHERE account_id = p_account AND appointment_id = p_appointment AND kind = 'stamp'))
    OR (p_job IS NOT NULL AND EXISTS (
      SELECT 1 FROM ws.loyalty_events WHERE account_id = p_account AND job_id = p_job AND kind = 'stamp'))
  ) THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;

  IF p_kind = 'stamp' AND prog.max_one_per_day THEN
    IF EXISTS (
      SELECT 1 FROM ws.loyalty_events e
      JOIN ws.loyalty_cards c ON c.account_id = e.account_id AND c.id = e.card_id
      WHERE e.account_id = p_account AND c.program_id = prog.id AND c.customer_id = p_customer
        AND e.kind = 'stamp' AND e.delta > 0 AND e.for_day = p_day
    ) THEN
      RETURN jsonb_build_object('result', 'same_day');
    END IF;
    v_delta := LEAST(v_delta, 1);
  END IF;

  SELECT * INTO card FROM ws.loyalty_cards
  WHERE account_id = p_account AND program_id = prog.id AND customer_id = p_customer AND status IN ('active', 'full')
  FOR UPDATE;

  -- Platnost: rozpracovaná karta platí N měsíců od prvního razítka (= založení
  -- karty). Plná karta nepropadá — odměna zákazníkovi zůstane.
  IF FOUND AND card.status = 'active' AND prog.validity_months IS NOT NULL
     AND card.created_at + make_interval(months => prog.validity_months) < now() THEN
    UPDATE ws.loyalty_cards SET status = 'expired' WHERE account_id = p_account AND id = card.id;
    IF card.stamps > 0 THEN
      INSERT INTO ws.loyalty_events (account_id, business_id, card_id, kind, delta, reason, actor)
      VALUES (p_account, p_business, card.id, 'expire', -card.stamps, 'Vypršela platnost karty', 'system');
    END IF;
    card := NULL;
  END IF;

  IF card.id IS NULL THEN
    IF v_delta < 0 THEN
      RETURN jsonb_build_object('result', 'none');
    END IF;
    INSERT INTO ws.loyalty_cards (account_id, business_id, program_id, customer_id, stamps, status)
    VALUES (p_account, p_business, prog.id, p_customer, 0, 'active')
    RETURNING * INTO card;
  END IF;

  IF card.status = 'full' AND v_delta > 0 THEN
    RETURN jsonb_build_object('result', 'full', 'card_id', card.id, 'added', 0, 'stamps', card.stamps,
      'needed', prog.stamps_needed, 'status', card.status);
  END IF;

  -- Přebytek nad plnou kartu propadá (částka 3 000 Kč při 4/5 = plná karta).
  v_new := GREATEST(0, LEAST(prog.stamps_needed, card.stamps + v_delta));
  v_add := v_new - card.stamps;
  IF v_add = 0 THEN
    RETURN jsonb_build_object('result', 'none', 'card_id', card.id, 'added', 0, 'stamps', card.stamps,
      'needed', prog.stamps_needed, 'status', card.status);
  END IF;

  UPDATE ws.loyalty_cards SET
    stamps = v_new,
    status = CASE WHEN v_new >= prog.stamps_needed THEN 'full' ELSE 'active' END,
    full_at = CASE WHEN v_new >= prog.stamps_needed THEN COALESCE(full_at, now()) ELSE NULL END
  WHERE account_id = p_account AND id = card.id
  RETURNING * INTO card;

  INSERT INTO ws.loyalty_events (account_id, business_id, card_id, appointment_id, job_id, kind, delta, reason, actor, for_day)
  VALUES (p_account, p_business, card.id, p_appointment, p_job, p_kind, v_add, p_reason, p_actor, p_day);

  RETURN jsonb_build_object('result', 'added', 'card_id', card.id, 'added', v_add, 'stamps', card.stamps,
    'needed', prog.stamps_needed, 'status', card.status);
END
$$;

-- 4 ---------------------------------------------------------------------------
-- Vrací false, když jeden ze zákazníků v účtu není (nebo jde o téhož).
CREATE OR REPLACE FUNCTION ws.merge_customers(p_account uuid, p_keep uuid, p_drop uuid, p_actor text)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  k ws.customers%ROWTYPE;
  d ws.customers%ROWTYPE;
  dc ws.loyalty_cards%ROWTYPE;
  kc ws.loyalty_cards%ROWTYPE;
  v_needed integer;
  v_new integer;
BEGIN
  IF p_keep = p_drop THEN
    RETURN false;
  END IF;
  -- Zámek v pevném pořadí, ať se dvě souběžná sloučení nezablokují.
  PERFORM 1 FROM ws.customers WHERE account_id = p_account AND id IN (p_keep, p_drop) ORDER BY id FOR UPDATE;
  SELECT * INTO k FROM ws.customers WHERE account_id = p_account AND id = p_keep;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO d FROM ws.customers WHERE account_id = p_account AND id = p_drop;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Rozpracované karty v témž programu: razítka se sečtou na ponechanou kartu.
  FOR dc IN
    SELECT * FROM ws.loyalty_cards WHERE account_id = p_account AND customer_id = p_drop AND status IN ('active', 'full') FOR UPDATE
  LOOP
    SELECT * INTO kc FROM ws.loyalty_cards
    WHERE account_id = p_account AND customer_id = p_keep AND program_id = dc.program_id AND status IN ('active', 'full')
    FOR UPDATE;
    IF FOUND THEN
      SELECT stamps_needed INTO v_needed FROM ws.loyalty_programs WHERE account_id = p_account AND id = dc.program_id;
      v_new := LEAST(v_needed, kc.stamps + dc.stamps);
      IF v_new > kc.stamps THEN
        UPDATE ws.loyalty_cards SET
          stamps = v_new,
          status = CASE WHEN v_new >= v_needed THEN 'full' ELSE 'active' END,
          full_at = CASE WHEN v_new >= v_needed THEN COALESCE(full_at, now()) ELSE NULL END
        WHERE account_id = p_account AND id = kc.id;
        INSERT INTO ws.loyalty_events (account_id, business_id, card_id, kind, delta, reason, actor)
        VALUES (p_account, kc.business_id, kc.id, 'manual', v_new - kc.stamps, 'Sloučení zákazníků', p_actor);
      END IF;
      UPDATE ws.loyalty_cards SET status = 'expired' WHERE account_id = p_account AND id = dc.id;
      IF dc.stamps > 0 THEN
        INSERT INTO ws.loyalty_events (account_id, business_id, card_id, kind, delta, reason, actor)
        VALUES (p_account, dc.business_id, dc.id, 'manual', -dc.stamps, 'Sloučení zákazníků', p_actor);
      END IF;
    END IF;
  END LOOP;

  UPDATE ws.loyalty_cards SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.requests SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.appointments SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.jobs SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.invoices SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.transactions SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.outbound_messages SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  UPDATE ws.segment_history SET customer_id = p_keep WHERE account_id = p_account AND customer_id = p_drop;
  -- skupinu ponechaného přepočítá aplikace hned po sloučení
  DELETE FROM ws.customer_segments WHERE account_id = p_account AND customer_id = p_drop;

  -- Duplikát pryč dřív, než ponechaný převezme jeho telefon a e-mail (unikátní v účtu).
  DELETE FROM ws.customers WHERE account_id = p_account AND id = p_drop;

  UPDATE ws.customers SET
    phone = COALESCE(k.phone, d.phone),
    email = COALESCE(k.email, d.email),
    birthday = COALESCE(k.birthday, d.birthday),
    note = CASE
      WHEN d.note IS NULL OR d.note = '' OR d.note = k.note THEN k.note
      WHEN k.note IS NULL OR k.note = '' THEN d.note
      ELSE k.note || E'\n\n' || d.note
    END,
    -- tentýž člověk: souhlas platí od prvního udělení, odhlášení od posledního
    contact_consent_at = LEAST(k.contact_consent_at, d.contact_consent_at),
    unsubscribed_at = GREATEST(k.unsubscribed_at, d.unsubscribed_at),
    created_at = LEAST(k.created_at, d.created_at)
  WHERE account_id = p_account AND id = p_keep;

  INSERT INTO ws.audit_log (account_id, actor, action, entity, entity_id, details)
  VALUES (p_account, COALESCE(p_actor, 'system'), 'customer.merge', 'customer', p_keep, jsonb_build_object('merged_id', p_drop));

  RETURN true;
END
$$;

-- 5 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ws.active_businesses()
RETURNS TABLE (account_id uuid, business_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT b.account_id, b.id FROM ws.businesses b WHERE b.archived_at IS NULL ORDER BY b.created_at
$$;

REVOKE ALL ON FUNCTION ws.active_businesses() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.active_businesses() TO ws_app;
  END IF;
END
$$;
