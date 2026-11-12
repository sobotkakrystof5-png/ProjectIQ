-- Migrace 107: admin faktury vystavuje, nejen archivuje (AD12)
--
-- Dnešní `invoices` (migrace 053) je archiv cizích PDF: jedna `amount`, číslo
-- jako ruční textové pole, žádné položky, žádný dodavatel, žádné DPH. Fakturu
-- proto Kryštof vyrábí jinde a sem nahrává hotové PDF — a číslo, splatnost,
-- IČO i odběratele opisuje u každé faktury znovu.
--
-- Tahle migrace nezakládá druhou evidenci. Na `invoices` visí
-- `finance_transaction_id`, `ai_extracted`, `pdf_data`, celé `invoice-actions.ts`
-- i `/api/public/invoices`; druhá tabulka by znamenala dva výpočty „po
-- splatnosti" a dvě místa, kde vzniká příjem. Rozšiřuje se tedy ta, která je.
--
-- **Dvě osy, ne jedna.** „Archiv" dnes neznamená přijatou fakturu — dnešní
-- řádky jsou Kryštofem vystavené faktury, jen vyrobené jinde (`lib/invoice-ai.ts`
-- čte z PDF *odběratele* a `syncInvoiceTransaction` z nich dělá **příjem**).
-- Proto `direction` (kdo komu fakturuje = příjem × výdaj) a `pdf_generated`
-- (PDF vyrobil systém, nebo se nahrálo) zvlášť. Backfill vychází z toho, co
-- dnešní řádky jsou: `direction='issued'`, `pdf_generated=false`.
--
-- **Formát čísla `YYYYNNN`** (`2026001`), ne `YYYY-NNNNNN`: variabilní symbol
-- smí být jen číslice a nejvýš 10 znaků. Workspace si kvůli pomlčce musí
-- z čísla nečíslice odstraňovat (`lib/ws/money/pdf.ts`), tohle jde do VS přímo.
-- 999 faktur ročně je pro jednoho člověka dost.
--
-- **Neměnnost patří do databáze, ne do UI.** Vystavenou fakturu dnes přepíše
-- cokoli — formulář archivu i AI přepis. Trigger `admin_invoice_locked` to
-- zavírá i pro ruční `UPDATE` v konzoli. Repo samo dokládá, proč kontrola
-- v aplikaci nestačí: migrace 046 přidala UNIQUE právě proto, že kontrola
-- v kódu byla TOCTOU. Opravuje se stornem a novou fakturou, číslo se nikdy
-- nerecykluje.
--
-- Aditivní a idempotentní. **Starý build adminu nerozbije:** všechny nové
-- sloupce mají default nebo jsou nullable, `direction` se starým řádkům
-- doplní na `issued` (takže unikátnost čísla platí dál přesně tam, kde
-- platila), a trigger se u řádků bez `number_seq` chová jako by nebyl.

-- ─── 1. Doklad: položky, dodavatel, DPH, číslo řady ──────────────────────────
-- `items` a `issuer` jsou snímek v okamžiku vystavení: pozdější změna profilu
-- dodavatele nesmí přepsat starší doklad. `client_address` dodává odběrateli
-- adresu, kterou archiv nikdy nepotřeboval (v nahraném PDF už byla).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS direction      text NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS pdf_generated  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS items          jsonb,
  ADD COLUMN IF NOT EXISTS issuer         jsonb,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS supplied_on    date,
  ADD COLUMN IF NOT EXISTS vat_total      numeric,
  ADD COLUMN IF NOT EXISTS number_seq     integer,
  ADD COLUMN IF NOT EXISTS cancelled_at   timestamptz,
  -- Kdy faktura odešla klientovi e-mailem. Odesílá se jen na kliknutí, nikdy
  -- automaticky při vystavení, takže tohle je zároveň odpověď na „poslal jsem ji?".
  ADD COLUMN IF NOT EXISTS sent_at        timestamptz;

DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_direction_check
    CHECK (direction IN ('issued', 'received'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vystavená v adminu = má číslo z řady. Ta musí mít položky i dodavatele,
-- jinak to není doklad. Archiv a přijaté faktury `number_seq` nemají.
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_issued_shape_check
    CHECK (
      number_seq IS NULL
      OR (
        items IS NOT NULL AND jsonb_typeof(items) = 'array'
        AND jsonb_array_length(items) BETWEEN 1 AND 50
        AND issuer IS NOT NULL AND jsonb_typeof(issuer) = 'object'
        AND direction = 'issued'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Unikátnost čísla jen u vystavených ───────────────────────────────────
-- Přijatá faktura nese číslo dodavatele, které se s vlastní řadou klidně
-- potká — globální UNIQUE z migrace 053 by evidenci nákladů zablokoval.
-- Pro dnešní data se nemění nic: všechny existující řádky jsou `issued`.
DROP INDEX IF EXISTS invoices_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_issued_key
  ON invoices (invoice_number) WHERE direction = 'issued';

-- Pojistka na řadu samotnou: dvě souběžná vystavení nesmějí dát totéž číslo
-- ani při selhání zámku v `admin_invoice_issue`.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_seq_key
  ON invoices (number_seq) WHERE number_seq IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_direction_idx ON invoices (direction);

-- ─── 3. Nastavení adminu: řada čísel a profil dodavatele ─────────────────────
-- Jeden řádek pro celý admin (`id boolean PK CHECK (id)`) — je to osobní
-- nástroj s jedním účtem (R-001). Řada čísel je `{"2026": 7}`, profil
-- dodavatele je předloha, ze které se na doklad bere snímek.
CREATE TABLE IF NOT EXISTS admin_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  invoice_sequences jsonb NOT NULL DEFAULT '{}'::jsonb,
  issuer_profile    jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO admin_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ─── 4. Vystavení: číslo a doklad v jedné transakci ──────────────────────────
-- Vzor je `ws.money_issue` (migrace 080). Zámek řádku nastavení drží řadu až
-- do COMMITu, takže souběžné vystavení počká a dostane další číslo — ne totéž
-- a ne díru. `GREATEST(uložené, nejvyšší v tabulce)` navíc přežije i ruční
-- zásah do `invoice_sequences`.
--
-- Částku i DPH **počítá databáze z položek** a proti poslané hodnotě je
-- porovná. Kdyby se zaokrouhlení v TypeScriptu a v SQL někdy rozešlo, pozná
-- se to tady — a ne až v daňovém základu.
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

  -- Haléře celé cesty: net = počet × jednotková cena v haléřích, DPH z netto.
  -- Shodné zaokrouhlení s `itemTotals` v lib/ws/money/calculations.ts.
  SELECT COALESCE(SUM(net), 0), COALESCE(SUM(round(net * COALESCE((item->>'vatRate')::numeric, 0) / 100)), 0)
    INTO v_net, v_vat
  FROM jsonb_array_elements(v_items) AS item,
       LATERAL (SELECT round((item->>'quantity')::numeric * round((item->>'unitPrice')::numeric * 100)) AS net) AS calc;

  v_amount := (v_net + v_vat) / 100;
  IF v_claimed IS NOT NULL AND abs(v_claimed - v_amount) > 0.004 THEN
    RAISE EXCEPTION 'admin_invoice_amount_mismatch' USING ERRCODE = '23514';
  END IF;

  -- Zámek jediného řádku nastavení = zámek celé řady.
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
    issued_on, supplied_on, due_on, amount, vat_total, currency, note, items, issuer
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
    p_data->'issuer'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION admin_invoice_issue(jsonb) FROM PUBLIC;

-- ─── 5. Vystavený doklad se nepřepisuje ──────────────────────────────────────
-- Měnit jde dál to, co se o faktuře dozvídáme *po* vystavení: zaplacení,
-- storno, poznámka, vazba na zakázku a na transakci v ledgeru. Náležitosti
-- dokladu ne. Archivu (`number_seq IS NULL`) se trigger netýká vůbec, takže
-- dnešní formulář i AI přepis fungují beze změny.
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
  THEN
    RAISE EXCEPTION 'admin_invoice_locked' USING ERRCODE = '23514';
  END IF;

  -- Storno je jednosměrné: zrušený doklad se už neoživuje, vystaví se nový.
  IF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'admin_invoice_locked' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_admin_invoice_locked ON invoices;
CREATE TRIGGER trg_admin_invoice_locked
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION admin_invoice_locked();

REVOKE ALL ON FUNCTION admin_invoice_locked() FROM PUBLIC;

-- ─── 6. Kontrola po spuštění ─────────────────────────────────────────────────
-- Po aplikaci musí platit, že se archiv nehnul:
--   SELECT count(*) FILTER (WHERE direction = 'issued') AS vystavene,
--          count(*) FILTER (WHERE number_seq IS NOT NULL) AS z_rady,
--          count(*) AS celkem
--   FROM invoices;
-- `z_rady` je hned po migraci vždy 0 — řadu začne plnit až první faktura
-- vystavená v adminu.
