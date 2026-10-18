-- Migrace 090: RD08 — více služeb v jedné rezervaci.
-- Jen připravit; aplikaci na Neon provádí majitel projektu.

-- Složené unikátní klíče dovolí vazby, které současně hlídají účet i byznys.
CREATE UNIQUE INDEX IF NOT EXISTS services_account_business_id_uq
  ON ws.services (account_id, business_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS requests_account_business_id_uq
  ON ws.requests (account_id, business_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_account_business_id_uq
  ON ws.appointments (account_id, business_id, id);

ALTER TABLE ws.appointments
  ADD COLUMN IF NOT EXISTS group_id uuid;

-- Skupinu úseků je potřeba přesouvat jedním UPDATE. Odložitelná kolize
-- zabrání falešné kolizi s dosavadní polohou stejné skupiny během transakce.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ws.appointments'::regclass AND conname = 'appointments_no_overlap'
      AND NOT condeferrable
  ) THEN
    ALTER TABLE ws.appointments DROP CONSTRAINT appointments_no_overlap;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ws.appointments'::regclass AND conname = 'appointments_no_overlap'
  ) THEN
    ALTER TABLE ws.appointments ADD CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
      staff_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    ) WHERE (status <> 'cancelled') DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointments_group_idx
  ON ws.appointments (account_id, business_id, group_id, starts_at)
  WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ws.request_services (
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  request_id uuid NOT NULL,
  service_id uuid,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, request_id, position),
  FOREIGN KEY (account_id, business_id, request_id)
    REFERENCES ws.requests (account_id, business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, business_id, service_id)
    REFERENCES ws.services (account_id, business_id, id) ON DELETE SET NULL (service_id)
);

CREATE INDEX IF NOT EXISTS request_services_service_idx
  ON ws.request_services (account_id, business_id, service_id);

SELECT ws.enable_account_rls('ws.request_services');
SELECT ws.add_touch_trigger('ws.request_services');
