-- Migrace 132: druh faktury a rozpis ceny zakázky (R-143)
--
-- Před vystavením se rozhoduje, o jakou fakturu jde: za celé dílo, zálohová
-- (obvykle 30 % předem), částečná (další část ceny, třeba 30 / 30 / 40) nebo
-- finální (doplatek všeho, co zbývá). Doklad si to nese s sebou:
--
-- - `invoice_kind` — druh; NULL u faktur před R-143 a u archivu nahraných PDF
--   (ty se chovají jako „Faktura" za celé dílo),
-- - `share_percent` — kolik procent ceny zakázky faktura pokrývá,
-- - `settlement` — rozpis v okamžiku vystavení: cena zakázky, předchozí
--   faktury, zálohy bez faktury, tahle faktura a co po ní zbývá. Snímek,
--   stejně jako `issuer`: pozdější faktury ho nepřepíšou.
--
-- Částku dál počítá `admin_invoice_issue` z položek (migrace 107). Procento
-- a rozpis počítá aplikace z databáze těsně před vystavením
-- (`lib/admin/invoice-kinds.ts`) — admin má jednoho uživatele, takže souběh
-- dvou vystavení u jedné zakázky reálně nehrozí.
--
-- Koncept faktury (migrace 117) si druh a procento pamatuje taky; částku
-- při schválení přepočítá podle stavu zakázky v tu chvíli.
--
-- Aditivní a idempotentní. Starý build adminu nové sloupce nezná a nová
-- verze `admin_invoice_issue` bez nových klíčů vloží NULL — chová se jako dřív.

-- ─── 1. Doklad ───────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_kind  text,
  ADD COLUMN IF NOT EXISTS share_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS settlement    jsonb;

DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_kind_check
    CHECK (invoice_kind IS NULL OR invoice_kind IN ('single', 'deposit', 'partial', 'final'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_share_percent_check
    CHECK (share_percent IS NULL OR (share_percent > 0 AND share_percent <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Koncept ──────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS invoice_drafts
  ADD COLUMN IF NOT EXISTS invoice_kind  text,
  ADD COLUMN IF NOT EXISTS share_percent numeric(5,2);

DO $$ BEGIN
  IF to_regclass('public.invoice_drafts') IS NOT NULL THEN
    ALTER TABLE invoice_drafts ADD CONSTRAINT invoice_drafts_kind_check
      CHECK (invoice_kind IS NULL OR invoice_kind IN ('single', 'deposit', 'partial', 'final'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF to_regclass('public.invoice_drafts') IS NOT NULL THEN
    ALTER TABLE invoice_drafts ADD CONSTRAINT invoice_drafts_share_percent_check
      CHECK (share_percent IS NULL OR (share_percent > 0 AND share_percent <= 100));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Vystavení ────────────────────────────────────────────────────────────
-- Tělo je z migrace 107; přibývají jen tři sloupce v INSERT.
CREATE OR REPLACE FUNCTION admin_invoice_issue(p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_year      text := left(p_data->>'issued_on', 4);
  v_seq       jsonb;
  v_n         integer;
  v_net       numeric;
  v_vat       numeric;
  v_amount    numeric;
  v_claimed   numeric := NULLIF(p_data->>'amount', '')::numeric;
  v_items     jsonb := p_data->'items';
  v_id        uuid;
BEGIN
  IF v_year !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'admin_invoice_bad_date' USING ERRCODE = '22007';
  END IF;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_items) < 1 OR jsonb_array_length(v_items) > 50 THEN
    RAISE EXCEPTION 'admin_invoice_items' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(net), 0), COALESCE(SUM(round(net * COALESCE((item->>'vatRate')::numeric, 0) / 100)), 0)
    INTO v_net, v_vat
  FROM jsonb_array_elements(v_items) AS item,
       LATERAL (SELECT round((item->>'quantity')::numeric * round((item->>'unitPrice')::numeric * 100)) AS net) AS calc;

  v_amount := (v_net + v_vat) / 100;
  IF v_claimed IS NOT NULL AND abs(v_claimed - v_amount) > 0.004 THEN
    RAISE EXCEPTION 'admin_invoice_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT invoice_sequences INTO v_seq FROM public.admin_settings WHERE id = true FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.admin_settings (id) VALUES (true);
    SELECT invoice_sequences INTO v_seq FROM public.admin_settings WHERE id = true FOR UPDATE;
  END IF;

  SELECT GREATEST(
           COALESCE((v_seq->>v_year)::integer, 0),
           COALESCE(MAX(number_seq) - v_year::integer * 1000, 0)
         ) + 1
    INTO v_n
  FROM public.invoices
  WHERE number_seq BETWEEN v_year::integer * 1000 + 1 AND v_year::integer * 1000 + 999;

  IF v_n > 999 THEN
    RAISE EXCEPTION 'admin_invoice_sequence_full' USING ERRCODE = '23505';
  END IF;

  UPDATE public.admin_settings
     SET invoice_sequences = jsonb_set(COALESCE(v_seq, '{}'::jsonb), ARRAY[v_year], to_jsonb(v_n)),
         updated_at = now()
   WHERE id = true;

  INSERT INTO public.invoices (
    invoice_number, number_seq, direction, pdf_generated,
    project_id, client_name, client_ico, client_dic, client_address,
    issued_on, supplied_on, due_on, amount, vat_total, currency, note, items, issuer,
    invoice_kind, share_percent, settlement
  ) VALUES (
    v_year || lpad(v_n::text, 3, '0'),
    v_year::integer * 1000 + v_n,
    'issued',
    true,
    NULLIF(p_data->>'project_id', '')::uuid,
    NULLIF(p_data->>'client_name', ''),
    NULLIF(p_data->>'client_ico', ''),
    NULLIF(p_data->>'client_dic', ''),
    NULLIF(p_data->>'client_address', ''),
    (p_data->>'issued_on')::date,
    NULLIF(p_data->>'supplied_on', '')::date,
    NULLIF(p_data->>'due_on', '')::date,
    v_amount,
    v_vat / 100,
    COALESCE(NULLIF(p_data->>'currency', ''), 'CZK'),
    NULLIF(p_data->>'note', ''),
    v_items,
    p_data->'issuer',
    NULLIF(p_data->>'invoice_kind', ''),
    NULLIF(p_data->>'share_percent', '')::numeric,
    CASE WHEN jsonb_typeof(p_data->'settlement') = 'object' THEN p_data->'settlement' END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION admin_invoice_issue(jsonb) FROM PUBLIC;

-- ─── 4. Druh a rozpis jsou náležitost dokladu, nepřepisují se ────────────────
-- Tělo je z migrace 107; přibývají tři řádky v podmínce.
CREATE OR REPLACE FUNCTION admin_invoice_locked() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.number_seq IS NULL THEN RETURN NEW; END IF;

  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.number_seq  IS DISTINCT FROM OLD.number_seq
     OR NEW.direction   IS DISTINCT FROM OLD.direction
     OR NEW.amount      IS DISTINCT FROM OLD.amount
     OR NEW.vat_total   IS DISTINCT FROM OLD.vat_total
     OR NEW.currency    IS DISTINCT FROM OLD.currency
     OR NEW.issued_on   IS DISTINCT FROM OLD.issued_on
     OR NEW.supplied_on IS DISTINCT FROM OLD.supplied_on
     OR NEW.due_on      IS DISTINCT FROM OLD.due_on
     OR NEW.items       IS DISTINCT FROM OLD.items
     OR NEW.issuer      IS DISTINCT FROM OLD.issuer
     OR NEW.client_name IS DISTINCT FROM OLD.client_name
     OR NEW.client_ico  IS DISTINCT FROM OLD.client_ico
     OR NEW.client_dic  IS DISTINCT FROM OLD.client_dic
     OR NEW.client_address IS DISTINCT FROM OLD.client_address
     OR NEW.invoice_kind   IS DISTINCT FROM OLD.invoice_kind
     OR NEW.share_percent  IS DISTINCT FROM OLD.share_percent
     OR NEW.settlement     IS DISTINCT FROM OLD.settlement
  THEN
    RAISE EXCEPTION 'admin_invoice_locked' USING ERRCODE = '23514';
  END IF;

  IF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'admin_invoice_locked' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION admin_invoice_locked() FROM PUBLIC;

-- Kontrola po spuštění:
--   SELECT count(*) FILTER (WHERE invoice_kind IS NOT NULL) AS s_druhem, count(*) AS celkem FROM invoices;
-- `s_druhem` je hned po migraci 0 — druh dostane až první nově vystavená faktura.
