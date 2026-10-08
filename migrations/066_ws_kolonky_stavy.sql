-- Migrace 066: Workspace — vlastní kolonky formuláře a stavy zakázek (S06)
--
-- Hodnoty kolonek se ukládají do jsonb (requests.field_values,
-- jobs.field_values) a validují Zodem sestaveným z field_definitions
-- (lib/ws/fields.ts, S11/S13). key je stabilní klíč v jsonb, label se smí měnit.

CREATE TABLE IF NOT EXISTS ws.field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'text', 'choice', 'select', 'number', 'date', 'slot', 'contact', 'address', 'file'
  )),
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  help_text text,
  position integer NOT NULL DEFAULT 0,
  show_on_web boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, key),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS field_definitions_account_business_idx ON ws.field_definitions (account_id, business_id);
SELECT ws.enable_account_rls('ws.field_definitions');
SELECT ws.add_touch_trigger('ws.field_definitions');

-- Vlastní stavy zakázky. Podle type fungují statistiky a věrnost, název je
-- na byznysu („Obhlídka“, „Vrtání“…).
CREATE TABLE IF NOT EXISTS ws.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('new', 'in_progress', 'done', 'paid', 'cancelled')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS stages_account_business_idx ON ws.stages (account_id, business_id);
SELECT ws.enable_account_rls('ws.stages');
SELECT ws.add_touch_trigger('ws.stages');
