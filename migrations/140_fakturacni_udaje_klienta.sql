-- Migrace 140: fakturační údaje klienta na jednom místě (R-153)
--
-- 1. `contacts.address` — sídlo / fakturační adresa kontaktu. Dosud ho kontakt
--    neměl, takže se do každé první faktury klienta psalo ručně. Formulář
--    faktury ho teď bere z kontaktu a vystavená faktura ho do kontaktu vrací.
-- 2. `invoices.client_contact` — e-mail a telefon odběratele vytištěné na
--    faktuře, {email, phone}. Je to snímek jako `issuer`: po vystavení se
--    nemění (zamyká ho `admin_invoice_locked`). Sloupec `client_email`
--    (migrace 117) zůstává „kam fakturu poslat" a měnit se smí.
-- 3. `portal.put_invoice` posílá e-mail a telefon odběratele i do klientského
--    prostoru — jsou to klientovy vlastní údaje, které má na svém PDF.
--    Údaje dodavatele jdou dál bez e-mailu a telefonu (DECISIONS #042).
--
-- Těla funkcí jsou z migrací 132 a 133; přibývá jen `client_contact`.
-- Aditivní a idempotentní. Starý build nové klíče neposílá: `client_contact`
-- zůstane NULL a faktura vypadá jako dřív. Faktury vystavené před migrací
-- e-mail ani telefon na PDF nemají, projekci proto není co přepočítat.

-- ─── 1. Sídlo kontaktu ───────────────────────────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address text;

-- ─── 2. Kontakt odběratele na dokladu ────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_contact jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_client_contact_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_client_contact_check
      CHECK (client_contact IS NULL OR jsonb_typeof(client_contact) = 'object');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Vystavení ────────────────────────────────────────────────────────────
-- Tělo je z migrace 132; přibývá `client_contact` (jen e-mail a telefon, oříznuté).
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
  v_contact   jsonb := NULLIF(jsonb_strip_nulls(jsonb_build_object(
                 'email', NULLIF(left(btrim(p_data->'client_contact'->>'email'), 254), ''),
                 'phone', NULLIF(left(btrim(p_data->'client_contact'->>'phone'), 40), '')
               )), '{}'::jsonb);
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
    invoice_kind, share_percent, settlement, client_contact
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
    CASE WHEN jsonb_typeof(p_data->'settlement') = 'object' THEN p_data->'settlement' END,
    v_contact
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION admin_invoice_issue(jsonb) FROM PUBLIC;

-- ─── 4. Kontakt odběratele je náležitost dokladu, nepřepisuje se ─────────────
-- Tělo je z migrace 132; přibývá jeden řádek v podmínce.
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
     OR NEW.client_contact IS DISTINCT FROM OLD.client_contact
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

-- ─── 5. Klientský prostor ────────────────────────────────────────────────────
-- Tělo je z migrace 133; přibývá e-mail a telefon odběratele v `customer`.
CREATE OR REPLACE FUNCTION portal.put_invoice(p_invoice uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  owner_client uuid;
  is_issued boolean;
  extra jsonb;
BEGIN
  IF p_invoice IS NULL THEN RETURN; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice;
  IF FOUND AND inv.project_id IS NOT NULL AND inv.direction = 'issued' THEN
    SELECT client_id INTO owner_client FROM portal.projects WHERE id = inv.project_id;
  END IF;
  IF owner_client IS NULL THEN
    DELETE FROM portal.invoices WHERE id = p_invoice;
    RETURN;
  END IF;

  is_issued := inv.number_seq IS NOT NULL;
  extra := to_jsonb(inv);

  INSERT INTO portal.invoices (
    id, client_id, project_id, number, kind, issued_on, supplied_on, due_on, paid_on, cancelled_at,
    amount, vat_total, currency, items, issuer, customer, printed_note, has_pdf, pdf_md5, document, updated_at
  ) VALUES (
    inv.id, owner_client, inv.project_id, inv.invoice_number,
    CASE WHEN is_issued THEN 'issued' ELSE 'archived' END,
    inv.issued_on, inv.supplied_on, inv.due_on, inv.paid_on, inv.cancelled_at,
    inv.amount, inv.vat_total, inv.currency,
    CASE WHEN is_issued AND jsonb_typeof(inv.items) = 'array' THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'description', x.e -> 'description',
               'quantity', x.e -> 'quantity',
               'unitPrice', x.e -> 'unitPrice',
               'vatRate', x.e -> 'vatRate'
             ) ORDER BY x.n), '[]'::jsonb)
      FROM jsonb_array_elements(inv.items) WITH ORDINALITY AS x(e, n)
    ) END,
    CASE WHEN is_issued AND jsonb_typeof(inv.issuer) = 'object' THEN jsonb_build_object(
      'name', inv.issuer -> 'name',
      'address', inv.issuer -> 'address',
      'ico', inv.issuer -> 'ico',
      'dic', inv.issuer -> 'dic',
      'bank', inv.issuer -> 'bank',
      'vatPayer', inv.issuer -> 'vatPayer',
      'tradeName', inv.issuer -> 'tradeName',
      'registry', inv.issuer -> 'registry',
      'web', inv.issuer -> 'web'
    ) END,
    CASE WHEN is_issued THEN jsonb_build_object(
      'name', inv.client_name,
      'address', inv.client_address,
      'ico', inv.client_ico,
      'dic', inv.client_dic,
      'email', extra -> 'client_contact' -> 'email',
      'phone', extra -> 'client_contact' -> 'phone'
    ) END,
    CASE WHEN is_issued THEN inv.note END,
    NOT is_issued AND inv.pdf_data IS NOT NULL,
    CASE WHEN NOT is_issued AND inv.pdf_data IS NOT NULL THEN md5(inv.pdf_data) END,
    CASE WHEN is_issued AND jsonb_typeof(extra -> 'invoice_kind') = 'string' THEN jsonb_build_object(
      'kind', extra -> 'invoice_kind',
      'percent', extra -> 'share_percent',
      'settlement', CASE WHEN jsonb_typeof(extra -> 'settlement') = 'object' THEN jsonb_build_object(
        'price', extra -> 'settlement' -> 'price',
        'paidOutside', extra -> 'settlement' -> 'paidOutside',
        'thisAmount', extra -> 'settlement' -> 'thisAmount',
        'thisPercent', extra -> 'settlement' -> 'thisPercent',
        'remainingAfter', extra -> 'settlement' -> 'remainingAfter',
        'invoices', CASE WHEN jsonb_typeof(extra -> 'settlement' -> 'invoices') = 'array' THEN (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'number', s.e -> 'number',
                   'kind', s.e -> 'kind',
                   'amount', s.e -> 'amount',
                   'paid', s.e -> 'paid'
                 ) ORDER BY s.n), '[]'::jsonb)
          FROM jsonb_array_elements(extra -> 'settlement' -> 'invoices') WITH ORDINALITY AS s(e, n)
        ) END
      ) END
    ) END,
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET client_id = EXCLUDED.client_id, project_id = EXCLUDED.project_id, number = EXCLUDED.number,
        kind = EXCLUDED.kind, issued_on = EXCLUDED.issued_on, supplied_on = EXCLUDED.supplied_on,
        due_on = EXCLUDED.due_on, paid_on = EXCLUDED.paid_on, cancelled_at = EXCLUDED.cancelled_at,
        amount = EXCLUDED.amount, vat_total = EXCLUDED.vat_total, currency = EXCLUDED.currency,
        items = EXCLUDED.items, issuer = EXCLUDED.issuer, customer = EXCLUDED.customer,
        printed_note = EXCLUDED.printed_note, has_pdf = EXCLUDED.has_pdf, pdf_md5 = EXCLUDED.pdf_md5,
        document = EXCLUDED.document, updated_at = EXCLUDED.updated_at;
END
$$;

-- Kontrola po spuštění:
--   SELECT count(*) FILTER (WHERE client_contact IS NOT NULL) FROM invoices;  -- 0, dokud se nevystaví nová
--   SELECT count(*) FILTER (WHERE address IS NOT NULL) FROM contacts;         -- 0, doplní se vystavením nebo v Kontaktech
