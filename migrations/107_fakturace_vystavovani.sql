-- Migration 107 (AD12): admin umí fakturu vystavit, ne jen archivovat cizí PDF
--
-- Dosud byla `invoices` archiv: jedna `amount`, ruční číslo v textovém poli,
-- přiložené PDF vyrobené někde jinde. Tahle migrace k tomu přidává druhou
-- cestu — doklad, který vznikne tady: má položky, snímek dodavatele, DPH,
-- atomicky přidělené číslo a PDF generuje systém.
--
-- Rozšiřuje se existující tabulka, nezakládá se druhá evidence. Na `invoices`
-- visí `finance_transaction_id`, `ai_extracted`, `pdf_data`, celé
-- `invoice-actions.ts` i `/api/public/invoices`; druhá tabulka by znamenala
-- dvě evidence, dva výpočty „po splatnosti" a dvě místa, kde může vzniknout
-- dvojí započtení příjmu.
--
-- ── Dvě osy místo jedné ──────────────────────────────────────────────────────
-- Plán původně počítal se sloupcem `kind ('archived'|'issued')`. To by ale
-- slilo dvě různé věci. Dnešní řádky **nejsou** přijaté faktury: jsou to
-- faktury Kryštofa, jen vyrobené v jiném nástroji — `lib/invoice-ai.ts` z nich
-- čte *odběratele* a `syncInvoiceTransaction` z nich dělá *příjem*. Proto:
--
--   `direction`     kdo komu fakturuje: `issued` = náš příjem, `received` =
--                   přijatá faktura (náklad). Backfill: všechno `issued`.
--   `pdf_generated` kdo vyrobil PDF: `true` = vystavila ho tahle aplikace
--                   (má položky, dodavatele a číslo z naší řady),
--                   `false` = nahrálo se hotové. Backfill: `false`.
--
-- Unikátnost čísla pak patří jen na `direction = 'issued'`: přijatá faktura
-- nese číslo dodavatele, které se s naší řadou klidně potká.
-- Přijaté faktury nemá v AD12 co zapsat — zavádí je AD13 (náklady). Sloupec
-- tu je proto, aby unikátní index nemusel nikdo později předělávat.
--
-- ── Číslo ────────────────────────────────────────────────────────────────────
-- Formát `YYYYNNN` (`2026001`), ne `YYYY-NNNNNN` z plánu: variabilní symbol
-- smí být jen číslice a nejvýš 10 znaků, takže číslo s pomlčkou by se do VS
-- muselo osekávat (`lib/ws/money/pdf.ts` to kvůli tomu dělá). `number_seq` je
-- totéž číslo jako integer (`rok*1000 + pořadí`), aby šlo unikátnost a pořadí
-- řady hlídat v databázi. 999 faktur za rok je pro jednoho člověka strop,
-- který nehrozí; kdyby přesto došly, funkce skončí chybou, ne přetečením.
--
-- ── Neměnnost patří do databáze ──────────────────────────────────────────────
-- Vystavenou fakturu dnes přepíše cokoli — formulář detailu i AI přepis.
-- Daňový doklad se ale po vystavení nemění: oprava se dělá stornem a novou
-- fakturou a číslo se nikdy nerecykluje. Hlídá to trigger, ne aplikace —
-- migrace 046 v tomhle repu je doklad, proč kontrola v kódu nestačí (unique
-- index tam vznikl právě proto, že kontrola v aplikaci byla TOCTOU).
--
-- Aplikovaná na produkci: ne.

-- ─── 1. Nové sloupce ────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS direction      text NOT NULL DEFAULT 'issued';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_generated  boolean NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS items          jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issuer         jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_address text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email   text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplied_on    date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_total      numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS number_seq     integer;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at        timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at   timestamptz;
-- Kontakt (AD09): `contact_id` = kdo to je, textové sloupce = co bylo na
-- dokladu napsáno. Odsud se bere odběratel při příští faktuře téhož člověka.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contact_id     uuid REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoices_contact_idx ON invoices (contact_id) WHERE contact_id IS NOT NULL;

-- ─── 2. Omezení ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_direction_check
    CHECK (direction IN ('issued', 'received'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Vystavená faktura musí mít všechno, co se tiskne na doklad. Archiv
-- (`pdf_generated = false`) tím prochází beze změny — proto je podmínka
-- celá schovaná za `NOT pdf_generated OR …`.
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_generated_check CHECK (
    NOT pdf_generated OR (
      direction = 'issued'
      AND number_seq IS NOT NULL
      AND supplied_on IS NOT NULL
      AND due_on IS NOT NULL
      AND issuer IS NOT NULL AND jsonb_typeof(issuer) = 'object'
      AND items IS NOT NULL AND jsonb_typeof(items) = 'array'
      AND jsonb_array_length(items) BETWEEN 1 AND 50
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `number_seq` je `rok*1000 + pořadí`, tedy sedmimístné číslo.
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_number_seq_range
    CHECK (number_seq IS NULL OR (number_seq >= 1990001 AND number_seq <= 2200999 AND number_seq % 1000 > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unikátnost čísla jen pro vlastní řadu. Dnešní řádky jsou všechny `issued`,
-- takže nový částečný index pokrývá přesně to, co dosud hlídal `invoices_number_key`.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_issued_key
  ON invoices (invoice_number) WHERE direction = 'issued';
DROP INDEX IF EXISTS invoices_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_seq_key
  ON invoices (number_seq) WHERE direction = 'issued' AND number_seq IS NOT NULL;

-- ─── 3. Nastavení adminu ────────────────────────────────────────────────────
-- Jeden řádek pro celou aplikaci (`id` je `true` s CHECK, takže druhý nevznikne).
-- `invoice_sequences` drží poslední pořadí v roce (`{"2026": 7}`),
-- `issuer_profile` údaje dodavatele; na dokladu je z nich neměnný snímek.
CREATE TABLE IF NOT EXISTS admin_settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  invoice_sequences jsonb NOT NULL DEFAULT '{}'::jsonb,
  issuer_profile    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO admin_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ─── 4. Atomické číslo ──────────────────────────────────────────────────────
-- Vzor je `ws.money_issue` (migrace 080): zámek na řádku nastavení, pořadí
-- jako větší z uloženého a skutečného maxima, zápis čísla i faktury v jedné
-- transakci. Dvě současná vystavení tak nemůžou dostat stejné číslo ani
-- nechat díru v řadě.
CREATE OR REPLACE FUNCTION admin_invoice_issue(p_data jsonb) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_issued   date := (p_data->>'issued_on')::date;
  v_year     int;
  v_saved    int;
  v_used     int;
  v_next     int;
  v_seq      int;
  v_id       uuid;
BEGIN
  IF v_issued IS NULL THEN
    RAISE EXCEPTION 'admin_invoice_missing_date';
  END IF;
  v_year := EXTRACT(YEAR FROM v_issued)::int;

  -- Zámek řádku nastavení drží pořadí; čeká na něj každé souběžné vystavení.
  SELECT COALESCE((invoice_sequences->>v_year::text)::int, 0) INTO v_saved
  FROM admin_settings WHERE id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO admin_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
    SELECT COALESCE((invoice_sequences->>v_year::text)::int, 0) INTO v_saved
    FROM admin_settings WHERE id FOR UPDATE;
  END IF;

  -- Pojistka pro případ, že by se nastavení rozešlo se skutečností
  -- (ruční zápis, obnova ze zálohy): řada nikdy nejde zpátky.
  SELECT COALESCE(MAX(number_seq) - v_year * 1000, 0) INTO v_used
  FROM invoices
  WHERE direction = 'issued' AND number_seq BETWEEN v_year * 1000 + 1 AND v_year * 1000 + 999;

  v_next := GREATEST(v_saved, v_used) + 1;
  IF v_next > 999 THEN
    RAISE EXCEPTION 'admin_invoice_sequence_full';
  END IF;
  v_seq := v_year * 1000 + v_next;

  UPDATE admin_settings
  SET invoice_sequences = jsonb_set(invoice_sequences, ARRAY[v_year::text], to_jsonb(v_next), true),
      updated_at = now()
  WHERE id;

  INSERT INTO invoices (
    invoice_number, number_seq, direction, pdf_generated,
    project_id, contact_id,
    client_name, client_address, client_ico, client_dic, client_email,
    issued_on, supplied_on, due_on,
    amount, vat_total, currency, note, items, issuer
  ) VALUES (
    v_seq::text, v_seq, 'issued', true,
    NULLIF(p_data->>'project_id', '')::uuid, NULLIF(p_data->>'contact_id', '')::uuid,
    NULLIF(p_data->>'client_name', ''), NULLIF(p_data->>'client_address', ''),
    NULLIF(p_data->>'client_ico', ''), NULLIF(p_data->>'client_dic', ''), NULLIF(p_data->>'client_email', ''),
    v_issued, (p_data->>'supplied_on')::date, (p_data->>'due_on')::date,
    (p_data->>'amount')::numeric, (p_data->>'vat_total')::numeric,
    COALESCE(NULLIF(p_data->>'currency', ''), 'CZK'), NULLIF(p_data->>'note', ''),
    p_data->'items', p_data->'issuer'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ─── 5. Neměnnost vystaveného dokladu ───────────────────────────────────────
-- Měnit jde dál datum zaplacení, odeslání, storno, vazba na ledger a poznámka.
-- Změna poznámky zahodí uložené PDF, aby se doklad vygeneroval znovu a
-- netvrdil něco jiného než jeho obsah v databázi.
CREATE OR REPLACE FUNCTION admin_invoice_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT OLD.pdf_generated THEN
    RETURN NEW;
  END IF;

  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.number_seq    IS DISTINCT FROM OLD.number_seq
     OR NEW.direction     IS DISTINCT FROM OLD.direction
     OR NEW.pdf_generated IS DISTINCT FROM OLD.pdf_generated
     OR NEW.amount        IS DISTINCT FROM OLD.amount
     OR NEW.vat_total     IS DISTINCT FROM OLD.vat_total
     OR NEW.currency      IS DISTINCT FROM OLD.currency
     OR NEW.issued_on     IS DISTINCT FROM OLD.issued_on
     OR NEW.supplied_on   IS DISTINCT FROM OLD.supplied_on
     OR NEW.due_on        IS DISTINCT FROM OLD.due_on
     OR NEW.items         IS DISTINCT FROM OLD.items
     OR NEW.issuer        IS DISTINCT FROM OLD.issuer
     OR NEW.client_name   IS DISTINCT FROM OLD.client_name
     OR NEW.client_address IS DISTINCT FROM OLD.client_address
     OR NEW.client_ico    IS DISTINCT FROM OLD.client_ico
     OR NEW.client_dic    IS DISTINCT FROM OLD.client_dic
  THEN
    RAISE EXCEPTION 'admin_invoice_immutable';
  END IF;

  IF NEW.note IS DISTINCT FROM OLD.note THEN
    NEW.pdf_data := NULL;
    NEW.pdf_filename := NULL;
    NEW.pdf_size := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS invoices_freeze ON invoices;
CREATE TRIGGER invoices_freeze BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION admin_invoice_freeze();

-- Vystavený doklad se nemaže: smazání by nechalo díru v číselné řadě
-- a daňová evidence musí být souvislá. Místo mazání je storno (`cancelled_at`).
CREATE OR REPLACE FUNCTION admin_invoice_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.pdf_generated THEN
    RAISE EXCEPTION 'admin_invoice_no_delete';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS invoices_no_delete ON invoices;
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION admin_invoice_no_delete();
