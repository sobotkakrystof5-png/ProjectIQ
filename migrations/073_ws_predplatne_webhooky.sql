-- Migrace 073: Workspace — předplatné a idempotence webhooků (S06, B5)
--
-- stripe_events a webhook_events jsou systémové tabulky bez RLS: webhook zná
-- účet až po zpracování události. Neukládá se payload (obsahuje osobní
-- údaje), jen ID události. Duplicitní událost skončí na PK:
--   INSERT … ON CONFLICT (id) DO NOTHING RETURNING id  → 0 řádků = už zpracováno.

CREATE TABLE IF NOT EXISTS ws.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  )),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  past_due_since timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_account_idx ON ws.subscriptions (account_id);
SELECT ws.enable_account_rls('ws.subscriptions');
SELECT ws.add_touch_trigger('ws.subscriptions');

CREATE TABLE IF NOT EXISTS ws.stripe_events (
  id text PRIMARY KEY CHECK (id ~ '^evt_'),
  type text NOT NULL,
  account_id uuid REFERENCES ws.accounts(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Clerk a Resend posílají přes Svix, id = hlavička svix-id.
CREATE TABLE IF NOT EXISTS ws.webhook_events (
  source text NOT NULL CHECK (source IN ('clerk', 'resend')),
  id text NOT NULL,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (source, id)
);
