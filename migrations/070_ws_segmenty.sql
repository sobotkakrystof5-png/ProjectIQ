-- Migrace 070: Workspace — skupiny zákazníků (segmenty, R-025) (S06)
--
-- Hranice má každý byznys vlastní (kadeřnice měří v týdnech, studnař v
-- letech), proto se skupina počítá pro dvojici zákazník × byznys, ne jako
-- sloupec u zákazníka. Přepočet po každé návštěvě a denně cronem (S12).

CREATE TABLE IF NOT EXISTS ws.segment_rules (
  business_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  new_days integer NOT NULL DEFAULT 30 CHECK (new_days > 0),
  regular_min_visits integer NOT NULL DEFAULT 3 CHECK (regular_min_visits > 0),
  regular_window_days integer NOT NULL DEFAULT 365 CHECK (regular_window_days > 0),
  dormant_factor numeric(4,2) NOT NULL DEFAULT 2 CHECK (dormant_factor >= 1),
  dormant_min_days integer NOT NULL DEFAULT 56 CHECK (dormant_min_days > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS segment_rules_account_business_idx ON ws.segment_rules (account_id, business_id);
SELECT ws.enable_account_rls('ws.segment_rules');
SELECT ws.add_touch_trigger('ws.segment_rules');

CREATE TABLE IF NOT EXISTS ws.customer_segments (
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  segment text NOT NULL CHECK (segment IN ('new', 'regular', 'one_time', 'dormant', 'ended')),
  visits_12m integer NOT NULL DEFAULT 0 CHECK (visits_12m >= 0),
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  typical_interval_days integer CHECK (typical_interval_days > 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, customer_id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customer_segments_account_business_idx ON ws.customer_segments (account_id, business_id);
CREATE INDEX IF NOT EXISTS customer_segments_segment_idx ON ws.customer_segments (business_id, segment);
SELECT ws.enable_account_rls('ws.customer_segments');

-- Historie změn skupin („letos se vrátilo 9 spících zákaznic“).
CREATE TABLE IF NOT EXISTS ws.segment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  from_segment text CHECK (from_segment IN ('new', 'regular', 'one_time', 'dormant', 'ended')),
  to_segment text NOT NULL CHECK (to_segment IN ('new', 'regular', 'one_time', 'dormant', 'ended')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS segment_history_account_business_idx ON ws.segment_history (account_id, business_id);
CREATE INDEX IF NOT EXISTS segment_history_changed_idx ON ws.segment_history (business_id, changed_at DESC);
SELECT ws.enable_account_rls('ws.segment_history');
