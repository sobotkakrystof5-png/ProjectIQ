-- Migrace 083: admin konzole — Klienti a Novinky (S17)
--
-- 1. ws.product_news: štítek (Nové / Vylepšení / Oprava), obrázek uložený
--    v DB (servíruje /z/novinky/[id]/obrazek — CSP aplikace pustí jen obrázky
--    z vlastní domény), kdy admin poslal novinku e-mailem a kolika lidem.
--    Denní cron posílá e-mailem jen novinky, které admin výslovně odeslal.
-- 2. ws.account_admin_notes: poznámka admina k účtu klienta. Interní — ws_app
--    nemá žádná práva, klient ji nikdy nepřečte. RLS jako všude (pojistka).
--
-- Píše jen admin (vlastník tabulek, RLS nepodléhá). Idempotentní.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE ws.product_news ADD COLUMN IF NOT EXISTS tag text NOT NULL DEFAULT 'new';
ALTER TABLE ws.product_news DROP CONSTRAINT IF EXISTS product_news_tag_check;
ALTER TABLE ws.product_news ADD CONSTRAINT product_news_tag_check CHECK (tag IN ('new', 'improvement', 'fix'));

ALTER TABLE ws.product_news ADD COLUMN IF NOT EXISTS image_data bytea;
ALTER TABLE ws.product_news ADD COLUMN IF NOT EXISTS image_type text;
ALTER TABLE ws.product_news DROP CONSTRAINT IF EXISTS product_news_image_check;
ALTER TABLE ws.product_news ADD CONSTRAINT product_news_image_check CHECK (
  (image_data IS NULL AND image_type IS NULL)
  OR (image_data IS NOT NULL AND octet_length(image_data) <= 614400
      AND image_type IN ('image/png', 'image/jpeg', 'image/webp'))
);

ALTER TABLE ws.product_news ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE ws.product_news ADD COLUMN IF NOT EXISTS email_recipients integer CHECK (email_recipients >= 0);
ALTER TABLE ws.product_news ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- E-mailem jen zveřejněná novinka.
ALTER TABLE ws.product_news DROP CONSTRAINT IF EXISTS product_news_emailed_check;
ALTER TABLE ws.product_news ADD CONSTRAINT product_news_emailed_check CHECK (emailed_at IS NULL OR published_at IS NOT NULL);

SELECT ws.add_touch_trigger('ws.product_news');

-- 2 ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ws.account_admin_notes (
  account_id uuid PRIMARY KEY REFERENCES ws.accounts(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(note) <= 4000),
  updated_by text NOT NULL CHECK (length(updated_by) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

SELECT ws.enable_account_rls('ws.account_admin_notes');
SELECT ws.add_touch_trigger('ws.account_admin_notes');

-- Výchozí práva (scripts/ws-grants.sql) dávají ws_app všechno — tady nic.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    REVOKE ALL ON ws.account_admin_notes FROM ws_app;
  END IF;
END
$$;
