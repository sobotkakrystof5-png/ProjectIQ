-- Migration 108 (AD12, doplněk): vystavený doklad se nemaže
--
-- Migrace 107 uzavřela **změnu** vystavené faktury (`admin_invoice_locked`),
-- ale ne její smazání. Archivní cestou (`deleteInvoice` ve Financích) tak jde
-- doklad z vlastní číselné řady odstranit úplně — a v řadě zůstane díra.
-- Daňová evidence musí být souvislá a číslo se nikdy nerecykluje, takže
-- oprava se dělá **stornem a novou fakturou**, ne mazáním.
--
-- Stejná hranice jako u 107: doklad z naší řady pozná `number_seq IS NOT NULL`.
-- Archiv cizích PDF (`number_seq IS NULL`) se dál maže beze změny, včetně
-- příjmu, který sám založil.
--
-- Aditivní a idempotentní; starý build adminu nerozbije (ten vystavené
-- doklady nemá a žádný tak nemaže).
--
-- Aplikovaná na produkci: ne.

CREATE OR REPLACE FUNCTION admin_invoice_undeletable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF OLD.number_seq IS NOT NULL THEN
    RAISE EXCEPTION 'admin_invoice_undeletable' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS trg_admin_invoice_undeletable ON invoices;
CREATE TRIGGER trg_admin_invoice_undeletable
  BEFORE DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION admin_invoice_undeletable();

REVOKE ALL ON FUNCTION admin_invoice_undeletable() FROM PUBLIC;

-- Kontrola po spuštění: smazání archivního dokladu musí projít dál,
-- smazání vystaveného skončit chybou `admin_invoice_undeletable`.
