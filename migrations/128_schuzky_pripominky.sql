-- Migrace 128: připomínky schůzek e-mailem a SMS (R-137)
--
-- Schůzka s Google Meet (R-114) jde od teď založit i přímo z kalendáře
-- přepínačem „Schůzka přes Google Meet". Klient dostane pozvánku hned
-- a pak připomínky: den předem e-mail a SMS, hodinu předem e-mail,
-- 10 minut předem SMS. Při přesunu termínu se připomínky přepočítají
-- a klient dostane zprávu o změně.
--
-- Odesílá je fronta níž. Spouští ji každou minutu externí cron
-- (`/api/cron/meeting-reminders`), protože Vercel Hobby pustí vlastní cron
-- jen jednou denně (R-006). Denní cron `send-reminders` je pojistka a hlídá,
-- jestli spouštěč běží (`admin_settings.reminders_tick_at`).
--
-- Aditivní a idempotentní, smí jít před nasazením. Bez ní se přepínač
-- schůzky v kalendáři neukáže a připomínky nevzniknou; zbytek adminu běží.

-- ─── 1. Schůzka u události ───────────────────────────────────────────────────
-- Telefon pro SMS v mezinárodním tvaru (+420…). E-mail klienta je už
-- `invite_to` z migrace 115.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meeting_phone text;
-- Připomínky zapnuté? Bez nich zůstane jen pozvánka.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminders_on boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_meeting_phone_check') THEN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_meeting_phone_check
      CHECK (meeting_phone IS NULL OR meeting_phone ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;
  END IF;
END
$$;

-- ─── 2. Fronta připomínek ────────────────────────────────────────────────────
-- Jeden řádek = jedna zpráva klientovi. `kind`:
--   h24 — den předem, h1 — hodinu předem, m10 — 10 minut předem,
--   changed — termín se změnil (odchází hned po uložení změny).
-- Text se skládá **až při odeslání** z aktuálního času schůzky, takže přesun
-- termínu stačí promítnout do `send_at`.
--
-- Stav: `pending` → `sending` jedním UPDATE, který řádek zamkne (dvakrát
-- neodejde) → `sent` / `failed`. `skipped` = čas propásl, nebo by zpráva
-- přišla těsně po pozvánce. `cancelled` = připomínky vypnuté nebo chybí
-- kontakt. Smazání schůzky smaže i její připomínky.
CREATE TABLE IF NOT EXISTS meeting_reminders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('h24', 'h1', 'm10', 'changed')),
  channel     text        NOT NULL CHECK (channel IN ('email', 'sms')),
  send_at     timestamptz NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  attempts    integer     NOT NULL DEFAULT 0,
  sent_at     timestamptz,
  provider_id text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, kind, channel)
);

-- Spouštěč každou minutu hledá jen čekající zprávy, kterým nadešel čas.
CREATE INDEX IF NOT EXISTS meeting_reminders_due_idx
  ON meeting_reminders (send_at)
  WHERE status = 'pending';

-- ─── 3. Hlídání spouštěče ────────────────────────────────────────────────────
-- Každý běh spouštěče sem zapíše čas. Když je starý a čekají zprávy, denní
-- cron pošle upozornění do zvonku a okno schůzky ukáže varování.
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS reminders_tick_at timestamptz;
