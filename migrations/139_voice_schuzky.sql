-- Migrace 139: ZakazIQ Voice — schůzky s klientem (R-151)
--
-- Online schůzka (Meet, Zoom, WhatsApp v počítači) až na 2 hodiny. Mac nahrává
-- dvě stopy zvlášť: mikrofon (Kryštof) a zvuk počítače (druhá strana). Každou
-- stopu dělí podle pauz na promluvy a posílá je na
-- `/api/public/voice/meetings/<id>/turns` už během schůzky. Server každou
-- promluvu přepíše a uloží; přepis schůzky jsou promluvy seřazené podle času.
-- Shrnutí udělá model až na kliknutí (Mac nebo admin).
--
-- Soukromí: zvuk se nikam neukládá. Text zůstává natrvalo, dokud ho Kryštof
-- nesmaže (R-151, stejně jako diktáty). Smazání schůzky smaže i promluvy
-- (cizí klíč). Smazání kontaktu odpojí schůzku (SET NULL), přepis zůstane,
-- dokud ho Kryštof nesmaže sám (žádost GDPR = smazat i schůzku).
--
-- Idempotentní: druhý běh nic nezmění. Na produkci aplikuje Kryštof (R-082).

CREATE TABLE IF NOT EXISTS voice_meetings (
  -- `id` vytvoří Mac, takže opakované založení nic nezdvojí.
  id             uuid        PRIMARY KEY,
  device_id      uuid        REFERENCES voice_devices(id) ON DELETE SET NULL,
  title          text        CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 160),
  started_at     timestamptz NOT NULL,
  ended_at       timestamptz,
  -- Délka podle Macu (2 hodiny + rezerva).
  duration_ms    integer     CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 7500000),
  status         text        NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'done')),
  -- Aplikace, ve které hovor běžel (Chrome, Zoom…), jen pro přehled.
  app_bundle_id  text        CHECK (app_bundle_id IS NULL OR char_length(app_bundle_id) <= 200),
  app_name       text        CHECK (app_name IS NULL OR char_length(app_name) <= 120),
  contact_id     uuid        REFERENCES contacts(id) ON DELETE SET NULL,
  -- Shrnutí od modelu (jsonb, tvar `lib/admin/voice/meeting-summary.ts`).
  summary        jsonb,
  summary_at     timestamptz,
  summary_model  text,
  cost_usd       numeric(10, 6) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_meetings_started_idx ON voice_meetings (started_at DESC);
CREATE INDEX IF NOT EXISTS voice_meetings_contact_idx ON voice_meetings (contact_id) WHERE contact_id IS NOT NULL;

-- Jedna promluva jedné strany. (meeting, stopa, pořadí) je klíč, opakované
-- odeslání z Macu nic nezdvojí.
CREATE TABLE IF NOT EXISTS voice_meeting_turns (
  meeting_id    uuid        NOT NULL REFERENCES voice_meetings(id) ON DELETE CASCADE,
  -- `me` = mikrofon (Kryštof), `other` = zvuk počítače (druhá strana).
  track         text        NOT NULL CHECK (track IN ('me', 'other')),
  idx           integer     NOT NULL CHECK (idx BETWEEN 0 AND 100000),
  -- Začátek od začátku schůzky a délka (ms).
  start_ms      integer     NOT NULL CHECK (start_ms BETWEEN 0 AND 7500000),
  duration_ms   integer     NOT NULL CHECK (duration_ms BETWEEN 0 AND 120000),
  speech_ms     integer     CHECK (speech_ms IS NULL OR speech_ms BETWEEN 0 AND 120000),
  status        text        NOT NULL CHECK (status IN ('ok', 'empty', 'blocked', 'error')),
  text          text        CHECK (text IS NULL OR char_length(text) <= 20000),
  guards        text[]      NOT NULL DEFAULT '{}',
  stt_provider  text,
  stt_model     text,
  stt_ms        integer,
  cost_usd      numeric(10, 6) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, track, idx)
);

CREATE INDEX IF NOT EXISTS voice_meeting_turns_order_idx ON voice_meeting_turns (meeting_id, start_ms);
