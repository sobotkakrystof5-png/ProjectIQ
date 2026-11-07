-- 099: Objednávací stránka jen pro účet, který dokončil registraci (R-077).
--
-- Účet a byznys vznikají v průvodci ještě před Stripe Checkoutem (R-038).
-- Kdo Checkout nedokončil, do aplikace nesmí, ale /r/[slug] a widget podle
-- slugu fungovaly dál: kdokoli by tak dostal veřejnou objednávku na
-- zakaziq.cz pod libovolným názvem firmy a poptávky skutečných lidí by
-- skončily tam, kde je nikdo nečte.
--
-- Nově ws.business_by_public_slug vrátí byznys jen tehdy, když účet má
-- aspoň jeden řádek ve ws.subscriptions (zapisuje ho až webhook Stripe po
-- dokončeném Checkoutu). Stav předplatného se nekontroluje: účet po
-- skončeném nebo nezaplaceném předplatném poptávky přijímá dál (R-045, B5).
-- Klíče webu (API, widget) se nemění — zakládá je jen majitel v aplikaci
-- nebo admin. Stejný podpis funkce, idempotentní.

CREATE OR REPLACE FUNCTION ws.business_by_public_slug(p_slug text)
RETURNS TABLE (account_id uuid, business_id uuid, public_key text, allowed_origins text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT b.account_id, b.id,
    (SELECT i.public_key FROM ws.web_integrations i
      WHERE i.account_id = b.account_id AND i.business_id = b.id AND i.active AND i.revoked_at IS NULL
      ORDER BY i.created_at LIMIT 1),
    COALESCE((SELECT array_agg(DISTINCT o) FROM ws.web_integrations i, unnest(i.allowed_origins) o
      WHERE i.account_id = b.account_id AND i.business_id = b.id AND i.active AND i.revoked_at IS NULL), '{}')
  FROM ws.businesses b
  WHERE b.slug = p_slug AND b.archived_at IS NULL
    AND EXISTS (SELECT 1 FROM ws.subscriptions s WHERE s.account_id = b.account_id)
$$;

REVOKE ALL ON FUNCTION ws.business_by_public_slug(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.business_by_public_slug(text) TO ws_app;
  END IF;
END
$$;
