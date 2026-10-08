-- Migrace 069: Workspace — věrnostní karty (S06)
--
-- 1 návštěva = nejvýš 1 razítko: hlídá DB unikátním indexem, ne aplikace.
-- Ruční přidání nebo odebrání razítka vyžaduje důvod (plán, Nastavení › Věrnost).

CREATE TABLE IF NOT EXISTS ws.loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  stamps_needed integer NOT NULL DEFAULT 5 CHECK (stamps_needed BETWEEN 1 AND 50),
  reward_text text NOT NULL DEFAULT '',
  counts text NOT NULL DEFAULT 'visit_paid' CHECK (counts IN ('visit_paid', 'job_done', 'amount')),
  amount_per_stamp numeric(12,2) CHECK (amount_per_stamp > 0),
  service_ids uuid[] NOT NULL DEFAULT '{}',
  min_spend numeric(12,2) CHECK (min_spend >= 0),
  max_one_per_day boolean NOT NULL DEFAULT true,
  validity_months integer CHECK (validity_months > 0),
  auto_stamp boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (counts <> 'amount' OR amount_per_stamp IS NOT NULL),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS loyalty_programs_account_business_idx ON ws.loyalty_programs (account_id, business_id);
SELECT ws.enable_account_rls('ws.loyalty_programs');
SELECT ws.add_touch_trigger('ws.loyalty_programs');

CREATE TABLE IF NOT EXISTS ws.loyalty_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  program_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  stamps integer NOT NULL DEFAULT 0 CHECK (stamps >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'full', 'redeemed', 'expired')),
  full_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, program_id) REFERENCES ws.loyalty_programs(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS loyalty_cards_account_business_idx ON ws.loyalty_cards (account_id, business_id);
-- zákazník má v programu nejvýš jednu rozpracovanou kartu
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_cards_open_uq ON ws.loyalty_cards (program_id, customer_id) WHERE status IN ('active', 'full');
SELECT ws.enable_account_rls('ws.loyalty_cards');
SELECT ws.add_touch_trigger('ws.loyalty_cards');

CREATE TABLE IF NOT EXISTS ws.loyalty_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  card_id uuid NOT NULL,
  appointment_id uuid,
  kind text NOT NULL CHECK (kind IN ('stamp', 'manual', 'redeem', 'expire')),
  delta integer NOT NULL,
  reason text,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'manual' OR reason IS NOT NULL),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, card_id) REFERENCES ws.loyalty_cards(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, appointment_id) REFERENCES ws.appointments(account_id, id) ON DELETE SET NULL (appointment_id)
);

CREATE INDEX IF NOT EXISTS loyalty_events_account_business_idx ON ws.loyalty_events (account_id, business_id);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_events_card_appointment_uq ON ws.loyalty_events (card_id, appointment_id) WHERE appointment_id IS NOT NULL;
-- přísnější pravidlo: jedna návštěva dá razítko jen jednou, ani na jinou kartu
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_events_stamp_uq ON ws.loyalty_events (appointment_id) WHERE kind = 'stamp' AND appointment_id IS NOT NULL;
SELECT ws.enable_account_rls('ws.loyalty_events');
