-- Migration 055: novinky z legislativy
--
-- Plní se týdenním cronem z veřejných RSS kanálů Finanční správy a ČSSZ —
-- zdarma, bez registrace, bez AI tokenů. Filtr je obyčejné porovnání
-- řetězců nad titulkem a popisem.
--
-- Idempotence stojí na unikátním `(source, guid)`: opakovaný běh cronu
-- nad stejným feedem nesmí založit duplicity. `guid` je identifikátor
-- položky z RSS (u obou zdrojů je jím v praxi odkaz na článek).
--
-- Je to informace, ne daňové poradenství — proto `link` i `published_at`
-- NOT NULL / vždy zobrazené, ať je v UI vidět zdroj a datum.

CREATE TABLE IF NOT EXISTS tax_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  guid text NOT NULL,
  title text NOT NULL,
  link text NOT NULL,
  published_at timestamptz,
  summary text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_news_guid_key ON tax_news (source, guid);
CREATE INDEX IF NOT EXISTS tax_news_published_idx ON tax_news (published_at DESC);
