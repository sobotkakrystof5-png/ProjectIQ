-- Migrace 115: schůzky s Google Meet a e-mail klientovi jedním klikem (R-112, krok 3 a 4)
--
-- „Domluvit schůzku" u firmy od AI asistenta založí událost v kalendáři adminu,
-- v Google Kalendáři Kryštofa (Workspace vizeon.cz) vznikne tatáž událost
-- s odkazem na Google Meet a klientovi odejde e-mail z krystof@vizeon.cz
-- (Resend) s odkazem na připojení, ukázkou a webem. Pozvánku od Googlu klient
-- nedostává (rozhodl Kryštof 2026-11-17) — událost v Googlu nemá hosty.
--
-- Aditivní a idempotentní, smí jít před nasazením. Bez ní se tlačítko
-- „Domluvit schůzku" neukáže a propojení Googlu nejde uložit.

-- ─── 1. Propojený Google účet ────────────────────────────────────────────────
-- Jeden admin, jeden Google účet (R-001). Obnovovací token je zašifrovaný
-- AES-256-GCM klíčem `GOOGLE_TOKEN_KEY` z prostředí — v databázi sám o sobě
-- nic neotevře. Tvar hlídá `lib/admin/google/oauth.ts`.
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS google_oauth jsonb;

-- ─── 2. Schůzka u události v kalendáři ───────────────────────────────────────
-- Odkaz na Meet (jen https://meet.google.com/…) a id události v Googlu, ať jde
-- schůzku zrušit i tam.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meet_url        text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_event_id text;

-- E-mail klientovi. Odchází s odkladem na „Zpět" (stejně jako dotazník, R-097):
-- `pending` → `sent` jedním UPDATE, který řádek zároveň zamkne, takže dvojí
-- odeslání nejde. „Zpět" přepne `pending` na `cancelled`.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_status      text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_to          text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_subject     text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_body        text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_demo_url    text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_send_after  timestamptz;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_sent_at     timestamptz;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_provider_id text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS invite_error       text;
-- Firma od asistenta, ze které schůzka vznikla (ať je vidět, odkud přišla).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS outreach_lead_id   uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_meet_url_check') THEN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_meet_url_check
      CHECK (meet_url IS NULL OR meet_url LIKE 'https://meet.google.com/%') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_invite_status_check') THEN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_invite_status_check
      CHECK (invite_status IS NULL OR invite_status IN ('pending', 'sending', 'sent', 'cancelled', 'failed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_outreach_fk')
     AND to_regclass('public.outreach_leads') IS NOT NULL THEN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_outreach_fk
      FOREIGN KEY (outreach_lead_id) REFERENCES outreach_leads(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Denní pojistka hledá e-maily, které po odkladu neodešly (spadlá funkce).
CREATE INDEX IF NOT EXISTS calendar_events_invite_pending_idx
  ON calendar_events (invite_send_after)
  WHERE invite_status = 'pending';
