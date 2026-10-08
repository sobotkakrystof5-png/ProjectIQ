-- Migrace 074: Workspace — nastavení e-mailů, fronta odchozích zpráv, upozornění (S06, B7)
--
-- E-mail se nikdy neposílá přímo z akce: zapíše se do outbound_messages a
-- odešle ho cron s opakováním (S15). Selhání odeslání tak nikdy neshodí
-- uložení poptávky.

-- Chybějící řádek = výchozí text a stav z kódu (lib/ws/email, S15).
CREATE TABLE IF NOT EXISTS ws.message_settings (
  account_id uuid NOT NULL,
  business_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN (
    'request_received', 'booking_confirmed', 'booking_changed', 'reminder', 'thank_you',
    'reward_ready', 'invoice', 'new_request', 'daily_digest', 'weekly_digest', 'monthly_digest'
  )),
  enabled boolean NOT NULL DEFAULT true,
  subject text,
  body text,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, type),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS message_settings_account_business_idx ON ws.message_settings (account_id, business_id);
SELECT ws.enable_account_rls('ws.message_settings');
SELECT ws.add_touch_trigger('ws.message_settings');

-- business_id NULL = zpráva účtu (např. neúspěšná platba předplatného).
CREATE TABLE IF NOT EXISTS ws.outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  business_id uuid,
  customer_id uuid,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  type text NOT NULL,
  to_address text NOT NULL,
  reply_to text,
  subject text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, customer_id) REFERENCES ws.customers(account_id, id) ON DELETE SET NULL (customer_id)
);

CREATE INDEX IF NOT EXISTS outbound_messages_account_business_idx ON ws.outbound_messages (account_id, business_id);
CREATE INDEX IF NOT EXISTS outbound_messages_queue_idx ON ws.outbound_messages (next_attempt_at) WHERE status IN ('queued', 'sending');
SELECT ws.enable_account_rls('ws.outbound_messages');
SELECT ws.add_touch_trigger('ws.outbound_messages');

-- Upozornění v aplikaci. member_id NULL = pro všechny členy účtu.
CREATE TABLE IF NOT EXISTS ws.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ws.accounts(id) ON DELETE CASCADE,
  business_id uuid,
  member_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, business_id) REFERENCES ws.businesses(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, member_id) REFERENCES ws.members(account_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS notifications_account_idx ON ws.notifications (account_id, created_at DESC);
SELECT ws.enable_account_rls('ws.notifications');
