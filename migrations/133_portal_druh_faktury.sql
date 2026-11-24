-- Migrace 133: druh faktury i v klientském prostoru (R-143)
--
-- Migrace 132 dala faktuře druh (zálohová, částečná, finální…), procento
-- z ceny zakázky a rozpis plateb. Klient si v prostoru stahuje PDF z projekce
-- `portal.invoices` — bez téhle migrace by tam zálohová faktura vyšla jako
-- obyčejná „Faktura" bez rozpisu, i když v adminu je správně.
--
-- Do projekce jde nový sloupec `document` = {kind, percent, settlement}.
-- Rozpis nese jen čísla dokladů téže zakázky a částky — nic, co by klient
-- neviděl už v seznamu svých faktur (DECISIONS #042).
--
-- Sloupce z migrace 132 se čtou přes `to_jsonb(inv)`, takže funkce funguje
-- i na databázi, kde 132 ještě neproběhla (pak je `document` NULL).
-- Tělo `portal.put_invoice` je z migrace 131; přibývá jen `document`.
-- Idempotentní: druhý běh funkci přepíše stejným tělem a projekci přepočítá.

ALTER TABLE portal.invoices ADD COLUMN IF NOT EXISTS document jsonb;

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
      'dic', inv.client_dic
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

SELECT portal.put_invoice(i.id)
FROM public.invoices i
JOIN portal.projects pp ON pp.id = i.project_id;
