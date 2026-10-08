-- Migrace 065: Workspace — služby, pracovníci, otevírací doba (S06)
--
-- Dovolené a blokace nejsou zvláštní tabulka: jsou to termíny s kind = 'block'
-- v ws.appointments (migrace 068), takže je hlídá stejné omezení na překryv.

CREATE TABLE IF NOT EXISTS ws.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  duration_min integer NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 5 AND 1440),
  price numeric(12,2) CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'CZK' CHECK (currency ~ '^[A-Z]{3}$'),
  active boolean NOT NULL DEFAULT true,
  show_on_web boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS services_account_business_idx ON ws.services (account_id, business_id);
SELECT ws.enable_account_rls('ws.services');
SELECT ws.add_touch_trigger('ws.services');

-- Pracovník nemusí mít přihlášení (member_id NULL = jen jméno v kalendáři).
CREATE TABLE IF NOT EXISTS ws.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  member_id uuid,
  name text NOT NULL,
  color text CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, member_id) REFERENCES ws.members(account_id, id) ON DELETE SET NULL (member_id)
);

CREATE INDEX IF NOT EXISTS staff_account_business_idx ON ws.staff (account_id, business_id);
SELECT ws.enable_account_rls('ws.staff');
SELECT ws.add_touch_trigger('ws.staff');

-- Kdo kterou službu dělá. Bez řádků = službu dělá kdokoli.
CREATE TABLE IF NOT EXISTS ws.service_staff (
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  service_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  PRIMARY KEY (service_id, staff_id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, service_id) REFERENCES ws.services(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, staff_id) REFERENCES ws.staff(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS service_staff_account_business_idx ON ws.service_staff (account_id, business_id);
SELECT ws.enable_account_rls('ws.service_staff');

-- Otevírací doba byznysu (staff_id NULL) a směny pracovníků. Víc řádků na
-- jeden den = pauza přes poledne. weekday 1 = pondělí … 7 = neděle.
CREATE TABLE IF NOT EXISTS ws.opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  staff_id uuid,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  opens time NOT NULL,
  closes time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes > opens),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, staff_id) REFERENCES ws.staff(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS opening_hours_account_business_idx ON ws.opening_hours (account_id, business_id);
SELECT ws.enable_account_rls('ws.opening_hours');
SELECT ws.add_touch_trigger('ws.opening_hours');
