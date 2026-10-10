-- Migrace 078: návštěva s uplatněnou odměnou nedostane ani pozdější ruční razítko.
-- Kontrola je uvnitř stejného zámku jako přidání razítka; RLS zůstává zapnuté.

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
      SELECT 1 FROM ws.loyalty_events WHERE account_id = p_account AND appointment_id = p_appointment AND kind IN ('stamp', 'redeem')))
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

