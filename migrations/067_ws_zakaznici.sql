-- Migrace 067: Workspace — zákazníci (S06)
--
-- Zákazník patří účtu, ne byznysu: kdo chodí do kadeřnictví i na kosmetiku
-- téže firmy, je jeden člověk. Skupinu (segment) má zvlášť pro každý byznys
-- v ws.customer_segments (migrace 070).
--
-- Rozpoznání zákazníka podle telefonu nebo e-mailu (B6): telefon se ukládá
-- normalizovaný v E.164 (+420…), e-mail malými písmeny. Unikátní v rámci
-- účtu, mezi účty se smí opakovat.

CREATE TABLE IF NOT EXISTS ws.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text CHECK (email = lower(email) AND position('@' IN email) > 1),
  birthday date,
  note text,
  contact_consent_at timestamptz,
  unsubscribed_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id)
);

CREATE INDEX IF NOT EXISTS customers_account_idx ON ws.customers (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uq ON ws.customers (account_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uq ON ws.customers (account_id, email) WHERE email IS NOT NULL;
SELECT ws.enable_account_rls('ws.customers');
SELECT ws.add_touch_trigger('ws.customers');
