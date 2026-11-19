-- Migrace 122: peníze a faktury v klientském prostoru (KP13, R-121, R-125, D-K15)
--
-- Klient u svých zakázek vidí cenu, kolik zaplatil, kolik zbývá a faktury.
-- Platí zásada z 095: role portal_app nemá práva do schématu public a do
-- portal se dostává jen to, co má klient vidět — triggerem nebo úzkou funkcí.
--
-- Co přibývá:
--   1. `portal.project_money` — souhrn peněz zakázky (cena, zaplaceno, zbývá),
--      v korunách. Výpočet je tentýž jako v adminu (`remainingSql`
--      v lib/admin/project-payments.ts, R-110 + R-125): zbývá = cena − vlastní
--      záloha (je-li zaplacená) − ručně zapsané zálohy − zaplacené korunové
--      faktury; zaplacená zakázka nezbývá nic. Zaplaceno = cena − zbývá.
--   2. `portal.invoices` — faktury zakázky se snímkem toho, co je na dokladu
--      vytištěné: položky, dodavatel (bez e-mailu), odběratel, splatnost,
--      poznámka *na faktuře*. Jen `direction = 'issued'` (přijaté faktury ne),
--      vystavené v adminu (`number_seq IS NOT NULL`) i archivní. Koncepty
--      (`invoice_drafts`, R-117) sem cestu nemají — jsou v jiné tabulce.
--   3. `portal.invoice_pdf` — úzká funkce, která klientovi vydá nahrané PDF
--      archivní faktury (`pdf_data`) po kontrole členství. PDF se do portal
--      nekopíruje (DECISIONS #042).
--
-- **Nikdy do portal:** interní poznámky (`projects.notes`, poznámka u archivní
-- faktury), `invoiced_on_ico`, linie přiznané/nepřiznané, řádky
-- `finance_transactions`, AI přepis (`ai_extracted`), e-mail odběratele.
-- Ze souhrnu peněz jde jen výsledné číslo, ne jednotlivé platby.
--
-- Triggery: změna zakázky (cena, zálohy, zaplaceno), faktury i ledgeru
-- (`finance_transactions`) přepočítá souhrn. Triggery jsou psané tak, aby
-- nikdy neshodily zápis v adminu: bez přetypování hodnot z jsonb a jen pro
-- zakázky propojené s klientem.
--
-- Po migraci pustit `node scripts/portal-create-role.js` (práva
-- z `scripts/portal-grants.sql`), jinak klient peníze neuvidí.
-- Vyžaduje migrace 053, 095, 096, 107 a 121 (přepisuje `portal.link_project`
-- z 121). Idempotentní, na konci doplní projekci už propojeným zakázkám.

-- ─── 1. Tabulky ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal.project_money (
  project_id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  price numeric,
  paid numeric NOT NULL DEFAULT 0,
  remaining numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CZK',
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS portal.invoices (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  number text NOT NULL,
  kind text NOT NULL,
  issued_on date NOT NULL,
  supplied_on date,
  due_on date,
  paid_on date,
  cancelled_at timestamptz,
  amount numeric NOT NULL,
  vat_total numeric,
  currency text NOT NULL,
  items jsonb,
  issuer jsonb,
  customer jsonb,
  printed_note text,
  has_pdf boolean NOT NULL DEFAULT false,
  pdf_md5 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS portal_invoices_project_idx ON portal.invoices (client_id, project_id, issued_on DESC);

ALTER TABLE portal.project_money ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.invoices ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_money', 'invoices'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = t AND policyname = 'client_isolation') THEN
      EXECUTE format(
        'CREATE POLICY client_isolation ON portal.%I USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client())',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ─── 2. Přepočet souhrnu peněz ───────────────────────────────────────────────
-- Stejný výpočet jako `remainingSql` v lib/admin/project-payments.ts. Kdo mění
-- jeden, mění i druhý — test kp13-penize-faktury je porovnává.

CREATE OR REPLACE FUNCTION portal.refresh_project_money(p_project uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  owner_client uuid;
  v_price numeric;
  v_paid_flag boolean;
  v_towards numeric;
  v_remaining numeric;
BEGIN
  IF p_project IS NULL THEN RETURN; END IF;
  SELECT client_id INTO owner_client FROM portal.projects WHERE id = p_project;
  IF owner_client IS NULL THEN RETURN; END IF;

  SELECT p.price, p.paid,
         CASE WHEN p.deposit_paid THEN COALESCE(p.deposit_amount, 0) ELSE 0 END
         + COALESCE((
             SELECT SUM(zt.amount) FROM public.finance_transactions zt
             WHERE zt.source_project_id = p.id AND zt.type = 'income'
               AND zt.user_id IS NULL AND zt.category = 'záloha'
           ), 0)
         + COALESCE((
             SELECT SUM(ft.amount) FROM public.finance_transactions ft
             JOIN public.invoices fi ON fi.id = ft.source_invoice_id
             WHERE fi.project_id = p.id AND fi.paid_on IS NOT NULL AND fi.currency = 'CZK'
               AND ft.type = 'income' AND ft.user_id IS NULL
           ), 0)
    INTO v_price, v_paid_flag, v_towards
  FROM public.projects p WHERE p.id = p_project;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_paid_flag THEN
    v_remaining := 0;
  ELSE
    v_remaining := GREATEST(COALESCE(v_price, 0) - v_towards, 0);
  END IF;

  INSERT INTO portal.project_money (project_id, client_id, price, paid, remaining, currency, updated_at)
  VALUES (
    p_project, owner_client, v_price,
    CASE WHEN COALESCE(v_price, 0) > 0 THEN v_price - v_remaining ELSE 0 END,
    v_remaining, 'CZK', now()
  )
  ON CONFLICT (project_id) DO UPDATE
    SET client_id = EXCLUDED.client_id, price = EXCLUDED.price, paid = EXCLUDED.paid,
        remaining = EXCLUDED.remaining, currency = EXCLUDED.currency, updated_at = EXCLUDED.updated_at;
END
$$;

-- ─── 3. Projekce jedné faktury ───────────────────────────────────────────────
-- Zapíše nebo smaže řádek v portal.invoices podle toho, jestli faktura patří
-- k zakázce propojené s klientem. Hodnoty z jsonb se nepřetypovávají, aby
-- neobvyklý obsah nikdy neshodil zápis faktury v adminu — tvar ověřuje
-- aplikace při čtení.

CREATE OR REPLACE FUNCTION portal.put_invoice(p_invoice uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  owner_client uuid;
  is_issued boolean;
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

  INSERT INTO portal.invoices (
    id, client_id, project_id, number, kind, issued_on, supplied_on, due_on, paid_on, cancelled_at,
    amount, vat_total, currency, items, issuer, customer, printed_note, has_pdf, pdf_md5, updated_at
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
      'vatPayer', inv.issuer -> 'vatPayer'
    ) END,
    CASE WHEN is_issued THEN jsonb_build_object(
      'name', inv.client_name,
      'address', inv.client_address,
      'ico', inv.client_ico,
      'dic', inv.client_dic
    ) END,
    CASE WHEN is_issued THEN inv.note END,
    NOT is_issued AND inv.pdf_data IS NOT NULL,
    CASE WHEN NOT is_issued AND inv.pdf_data IS NOT NULL THEN md5(inv.pdf_data) END,
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET client_id = EXCLUDED.client_id, project_id = EXCLUDED.project_id, number = EXCLUDED.number,
        kind = EXCLUDED.kind, issued_on = EXCLUDED.issued_on, supplied_on = EXCLUDED.supplied_on,
        due_on = EXCLUDED.due_on, paid_on = EXCLUDED.paid_on, cancelled_at = EXCLUDED.cancelled_at,
        amount = EXCLUDED.amount, vat_total = EXCLUDED.vat_total, currency = EXCLUDED.currency,
        items = EXCLUDED.items, issuer = EXCLUDED.issuer, customer = EXCLUDED.customer,
        printed_note = EXCLUDED.printed_note, has_pdf = EXCLUDED.has_pdf, pdf_md5 = EXCLUDED.pdf_md5,
        updated_at = EXCLUDED.updated_at;
END
$$;

-- ─── 4. Triggery ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION portal.sync_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal.invoices WHERE id = OLD.id;
    PERFORM portal.refresh_project_money(OLD.project_id);
    RETURN OLD;
  END IF;
  PERFORM portal.put_invoice(NEW.id);
  PERFORM portal.refresh_project_money(NEW.project_id);
  IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    PERFORM portal.refresh_project_money(OLD.project_id);
  END IF;
  RETURN NEW;
END
$$;

-- Ledger: ruční zálohy (source_project_id) a příjmy z faktur (source_invoice_id).
-- Osobní řádky bez vazby na zakázku ani fakturu skončí hned na začátku.
CREATE OR REPLACE FUNCTION portal.sync_money_from_ledger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  touched uuid[] := ARRAY[]::uuid[];
  pid uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.source_project_id IS NOT NULL THEN touched := touched || OLD.source_project_id; END IF;
    IF OLD.source_invoice_id IS NOT NULL THEN
      touched := touched || (SELECT i.project_id FROM public.invoices i WHERE i.id = OLD.source_invoice_id);
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.source_project_id IS NOT NULL THEN touched := touched || NEW.source_project_id; END IF;
    IF NEW.source_invoice_id IS NOT NULL THEN
      touched := touched || (SELECT i.project_id FROM public.invoices i WHERE i.id = NEW.source_invoice_id);
    END IF;
  END IF;

  FOR pid IN SELECT DISTINCT u FROM unnest(touched) AS u WHERE u IS NOT NULL LOOP
    PERFORM portal.refresh_project_money(pid);
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION portal.sync_project_money() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price
     OR NEW.paid IS DISTINCT FROM OLD.paid
     OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
     OR NEW.deposit_paid IS DISTINCT FROM OLD.deposit_paid THEN
    PERFORM portal.refresh_project_money(NEW.id);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS portal_sync_invoice ON public.invoices;
CREATE TRIGGER portal_sync_invoice
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION portal.sync_invoice();

DROP TRIGGER IF EXISTS portal_sync_money_ledger ON public.finance_transactions;
CREATE TRIGGER portal_sync_money_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION portal.sync_money_from_ledger();

DROP TRIGGER IF EXISTS portal_sync_project_money ON public.projects;
CREATE TRIGGER portal_sync_project_money
  AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION portal.sync_project_money();

-- ─── 5. PDF archivní faktury pro klienta ─────────────────────────────────────
-- Jediné místo, kde portal_app dosáhne na bajty v public: jedna faktura, jen
-- archivní (nahrané PDF), jen když je v projekci aktuálního klienta a člen
-- k zakázce patří. Vrací base64 (HTTP ovladač Neonu jinak bytea escapuje).

CREATE OR REPLACE FUNCTION portal.invoice_pdf(p_invoice uuid, p_member uuid)
RETURNS TABLE (pdf_base64 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.current_client();
  v_project uuid;
BEGIN
  SELECT pi.project_id INTO v_project
  FROM portal.invoices pi
  WHERE pi.id = p_invoice AND pi.client_id = cid AND pi.kind = 'archived' AND pi.has_pdf;
  IF cid IS NULL OR v_project IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM portal.assert_member_project(v_project, p_member);

  RETURN QUERY
    SELECT encode(i.pdf_data, 'base64')
    FROM public.invoices i
    WHERE i.id = p_invoice AND i.project_id = v_project AND i.direction = 'issued'
      AND i.number_seq IS NULL AND i.pdf_data IS NOT NULL;
END
$$;

-- ─── 6. Propojení zakázky s klientem kopíruje i peníze a faktury ─────────────
-- Tělo z migrace 121 + dva řádky na konci.

CREATE OR REPLACE FUNCTION portal.link_project(p_client uuid, p_project uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project AND client_id <> p_client) THEN
    RAISE EXCEPTION 'Zakázka už patří jinému klientovi.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO portal.projects (id, client_id, name, description, status, progress, deadline, project_url, updated_at)
  SELECT p.id, p_client, p.client_name, p.description, p.status, p.progress, p.deadline, p.project_url, p.updated_at
  FROM public.projects p WHERE p.id = p_project
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM portal.projects WHERE id = p_project) THEN
    RAISE EXCEPTION 'Zakázka neexistuje.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO portal.activity (id, client_id, project_id, kind, title, body, published_at)
  SELECT a.id, p_client, a.project_id, a.kind, a.title, a.body, a.published_at
  FROM public.project_activity a
  WHERE a.project_id = p_project AND a.status = 'published' AND a.published_at IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO portal.phases (id, client_id, project_id, position, name, description, due_date, status, done_at)
  SELECT ph.id, p_client, ph.project_id, ph.position, ph.name, ph.client_description, ph.due_date, ph.status, ph.done_at
  FROM public.project_phases ph WHERE ph.project_id = p_project
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO portal.phase_tasks (id, client_id, project_id, phase_id, position, body, done_at)
  SELECT t.id, p_client, t.project_id, t.phase_id, t.position, t.body, t.client_done_at
  FROM public.project_phase_tasks t WHERE t.project_id = p_project
  ON CONFLICT (id) DO NOTHING;

  PERFORM portal.put_invoice(i.id) FROM public.invoices i WHERE i.project_id = p_project;
  PERFORM portal.refresh_project_money(p_project);
END
$$;

REVOKE ALL ON FUNCTION portal.refresh_project_money(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.put_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.sync_invoice() FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.sync_money_from_ledger() FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.sync_project_money() FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.invoice_pdf(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.link_project(uuid, uuid) FROM PUBLIC;

-- ─── 7. Doplnění pro zakázky, které už s klientem propojené jsou ─────────────

SELECT portal.put_invoice(i.id)
FROM public.invoices i
JOIN portal.projects pp ON pp.id = i.project_id;

SELECT portal.refresh_project_money(pp.id) FROM portal.projects pp;
