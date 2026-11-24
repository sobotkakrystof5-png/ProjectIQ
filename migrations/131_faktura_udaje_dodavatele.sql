-- Migrace 131: údaje dodavatele na faktuře v klientském prostoru (R-142)
--
-- Faktura vystavená v adminu nese snímek dodavatele (`public.invoices.issuer`).
-- Od R-142 v něm jsou i obchodní značka, údaj o zápisu do rejstříku (povinný
-- na obchodní listině podle § 435 občanského zákoníku), web a kontakt. Projekce do
-- klientského prostoru (`portal.put_invoice`, migrace 122) ale bere z jsonb jen
-- vyjmenované klíče — bez téhle migrace by si klient stáhl PDF bez údaje
-- o zápisu, i když admin ho na faktuře má.
--
-- Přibývá jen značka, údaj o zápisu a web. E-mail a telefon dodavatele do
-- prostoru záměrně nejdou (DECISIONS #042 — projekce nese jen to, co klient
-- potřebuje; hlídá to test kp13), PDF v prostoru je proto bez kontaktního řádku.
-- Zbytek funkce je beze změny proti 122.
-- `CREATE OR REPLACE` zachová vlastníka i odebraná práva (REVOKE v 122).
-- Idempotentní: druhý běh funkci přepíše stejným tělem a projekci přepočítá.

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
      'vatPayer', inv.issuer -> 'vatPayer',
      'tradeName', inv.issuer -> 'tradeName',
      'registry', inv.issuer -> 'registry',
      'web', inv.issuer -> 'web'
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

-- Přepočítat projekci faktur, které už v klientském prostoru jsou. Snímky
-- před R-142 nové klíče nemají, `->` vrátí NULL a PDF je prostě nevytiskne.
SELECT portal.put_invoice(i.id)
FROM public.invoices i
JOIN portal.projects pp ON pp.id = i.project_id;
