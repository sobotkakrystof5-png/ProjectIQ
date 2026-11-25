-- Migrace 134: Schůzky a přepisy (R-144)
--
-- Přepis schůzky z Wispr Flow (nebo vložený ručně) se uloží doslovně, AI z něj
-- udělá shrnutí, body, na čem jsme se domluvili, další kroky a návrh, o kterého
-- klienta jde. Klientovi se připraví koncept e-mailu v Gmailu; přepis zůstává
-- jen tady.
--
-- Wispr Flow nemá API ani webhook. Schůzky posílá naplánovaná úloha Clauda
-- s konektorem Wispr Flow na POST /api/public/schuzky (klíč MEETING_NOTES_API_KEY).
--
-- `transcript` je přesně to, co přišlo — nic ho nepřepisuje, ani AI.
-- `contact_id` maže kaskádou: výmaz kontaktu na žádost GDPR vezme i jeho přepisy.
-- `contact_source` říká, proč je klient přiřazený: shoda e-mailu nebo telefonu
-- účastníka, schůzka v kalendáři ve stejný čas, nebo to potvrdil Kryštof.
--
-- Aditivní a idempotentní; smí jít před nasazením.

CREATE TABLE IF NOT EXISTS meeting_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('wispr', 'manual')),
  source_id         text CHECK (source_id IS NULL OR length(source_id) BETWEEN 1 AND 200),
  title             text,
  started_at        timestamptz,
  ended_at          timestamptz,
  share_link        text,
  participants      jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_summary    text,
  transcript        text NOT NULL CHECK (length(transcript) BETWEEN 1 AND 1000000),
  declared_chars    integer CHECK (declared_chars IS NULL OR declared_chars >= 0),
  ai_status         text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending', 'done', 'failed')),
  ai_attempts       integer NOT NULL DEFAULT 0,
  ai_claimed_at     timestamptz,
  ai                jsonb,
  ai_error          text,
  ai_at             timestamptz,
  contact_id        uuid REFERENCES contacts(id) ON DELETE CASCADE,
  contact_source    text CHECK (contact_source IS NULL OR contact_source IN ('email', 'telefon', 'kalendar', 'potvrzeno')),
  contact_at        timestamptz,
  calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
  email_to          text,
  gmail_draft_id    text,
  gmail_message_id  text,
  gmail_draft_at    timestamptz,
  gmail_error       text,
  hidden_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Jedna schůzka z Wispr Flow = jeden řádek, ať opakované poslání nic nezdvojí.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_notes_source_uq
  ON meeting_notes (source, source_id) WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meeting_notes_started_idx
  ON meeting_notes ((coalesce(started_at, created_at)) DESC);

CREATE INDEX IF NOT EXISTS meeting_notes_contact_idx
  ON meeting_notes (contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS meeting_notes_pending_idx
  ON meeting_notes (created_at) WHERE ai_status <> 'done';
