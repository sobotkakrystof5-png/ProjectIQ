-- Migrace 123: konzultace z volna v kalendáři (KP14, R-121, R-126, D-K13)
--
-- Kryštof v kalendáři adminu označí **Volno pro klienty**. Klient si v něm
-- zarezervuje konzultaci (v klientském prostoru `/klient` i přes odkaz `/p`),
-- mimo volno si nezarezervuje nic. Pevné hodiny z `getHourSlots` (všední dny
-- 14–20, víkend 8–22) tím končí.
--
-- Pravidla (rozhodl Kryštof 2026-11-20, D-K13):
--   * výchozí délka konzultace 30 minut, u každého volna jde změnit,
--   * nejdřív 2 hodiny před začátkem,
--   * přesun a zrušení klientem do 24 hodin před začátkem,
--   * počet budoucích konzultací na klienta se neomezuje (jen technický strop
--     10 rezervací za hodinu na člena a 5 přesunů jedné konzultace proti zneužití).
--
-- Proč vlastní tabulka a ne `calendar_events`: překryvový guard z migrací 008,
-- 044 a 105 bere každou událost jako obsazený čas, takže by rezervace uvnitř
-- volna kolidovala s volnem samotným.
--
-- Volno se drží v **pražském nástěnném čase** (den + čas od–do), ne jako
-- okamžik: týdenní opakování tak přes změnu letního času zůstane „ve čtvrtek
-- od 14:00", ne „ve čtvrtek od 13:00".
--
-- Volné časy počítá jediná funkce `consultation_free_slots`: volno − události
-- kalendáře − konzultace − plánované hovory (30 minut), po délce konzultace,
-- s předstihem. Čte ji výpis v `/klient` i na `/p` a rezervace ji před zápisem
-- volá znovu pod zámkem (`pg_advisory_xact_lock`), takže dvě souběžné
-- rezervace na tentýž čas nikdy obě neprojdou.
--
-- Klient (role portal_app) nevidí z volna ani z cizích rezervací nic kromě
-- časů, které jsou volné. Své konzultace čte z projekce `portal.consultations`
-- (trigger), zapisuje jen funkcemi `portal.book_/move_/cancel_consultation`.
--
-- Vyžaduje migrace 001–014 (consultation_slots), 044, 051, 095, 096, 104, 105
-- a 115. Aditivní a idempotentní, smí jít před nasazením. Po ní pustit
-- `node scripts/portal-create-role.js` (práva z `scripts/portal-grants.sql`).

-- ─── 1. Volno pro klienty ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- První (nebo jediný) den volna, pražské datum.
  day date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 15 AND 180),
  repeat_weekly boolean NOT NULL DEFAULT false,
  -- Poslední den opakování (včetně). NULL = opakuje se bez konce.
  repeat_until date,
  -- Dny, kdy opakované volno neplatí („smazat jen tenhle den").
  skip_days date[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_availability_times CHECK (end_time > start_time),
  CONSTRAINT client_availability_fits CHECK (
    extract(epoch FROM (end_time - start_time)) / 60 >= slot_minutes
  ),
  CONSTRAINT client_availability_until CHECK (
    repeat_until IS NULL OR (repeat_weekly AND repeat_until >= day)
  )
);

CREATE INDEX IF NOT EXISTS client_availability_day_idx ON public.client_availability (day);

-- ─── 2. Rezervace: délka, odkud přišla, Meet a potvrzení ─────────────────────

ALTER TABLE public.consultation_slots ADD COLUMN IF NOT EXISTS duration_minutes integer;
-- 'odkaz' = /p/[token], 'prostor' = /klient. Starší řádky NULL.
ALTER TABLE public.consultation_slots ADD COLUMN IF NOT EXISTS booked_via text;
ALTER TABLE public.consultation_slots ADD COLUMN IF NOT EXISTS portal_member_id uuid;
-- Google Meet: 'pending' čeká, 'creating' se zakládá, 'ready' hotovo,
-- 'failed' se nepovedlo (rezervace platí dál, Kryštof dostane upozornění).
ALTER TABLE public.consultation_slots ADD COLUMN IF NOT EXISTS meet_status text;
-- Potvrzení klientovi odešlo. Přesun ho vynuluje, takže odejde nové.
ALTER TABLE public.consultation_slots ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
ALTER TABLE public.consultation_slots ADD COLUMN IF NOT EXISTS move_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_slots_duration_check') THEN
    ALTER TABLE public.consultation_slots ADD CONSTRAINT consultation_slots_duration_check
      CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 180) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_slots_booked_via_check') THEN
    ALTER TABLE public.consultation_slots ADD CONSTRAINT consultation_slots_booked_via_check
      CHECK (booked_via IS NULL OR booked_via IN ('odkaz', 'prostor')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_slots_meet_status_check') THEN
    ALTER TABLE public.consultation_slots ADD CONSTRAINT consultation_slots_meet_status_check
      CHECK (meet_status IS NULL OR meet_status IN ('pending', 'creating', 'ready', 'failed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_slots_member_fk') THEN
    ALTER TABLE public.consultation_slots ADD CONSTRAINT consultation_slots_member_fk
      FOREIGN KEY (portal_member_id) REFERENCES portal.members(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Denní pojistka hledá rezervace, kterým po rezervaci nedoběhl Meet nebo e-mail.
CREATE INDEX IF NOT EXISTS consultation_slots_unfinished_idx
  ON public.consultation_slots (scheduled_at)
  WHERE meet_status IN ('pending', 'creating') OR (booked_via IS NOT NULL AND confirmation_sent_at IS NULL);

-- ─── 3. Kalendářní událost rezervace má její délku ───────────────────────────
-- Tělo z migrace 105; mění se jen délka (dřív vždy hodina) a text u kontaktu
-- v Hovorech podle toho, odkud rezervace přišla.

CREATE OR REPLACE FUNCTION public.admin_slot_ensure_event(p_slot uuid) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  s record;
  p record;
  v_event uuid;
  v_lead uuid;
  v_title text;
BEGIN
  SELECT id, project_id, scheduled_at, client_wish, client_email, contact_id, calendar_event_id,
         duration_minutes, booked_via, channel
  INTO s FROM public.consultation_slots WHERE id = p_slot FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rezervace nenalezena.';
  END IF;
  IF s.calendar_event_id IS NOT NULL THEN
    RETURN s.calendar_event_id;
  END IF;

  SELECT client_name, client_phone, client_email, contact_id, lead_origin
  INTO p FROM public.projects WHERE id = s.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zakázka rezervace nenalezena.';
  END IF;

  v_title := 'Konzultace: ' || p.client_name;

  INSERT INTO public.calendar_events
    (title, description, starts_at, ends_at, event_type, project_id, lead_origin, consultation_slot_id)
  VALUES
    (v_title, s.client_wish, s.scheduled_at,
     s.scheduled_at + make_interval(mins => COALESCE(s.duration_minutes, 60)), 'manual',
     s.project_id, COALESCE(p.lead_origin, 'vizeon'), s.id)
  RETURNING id INTO v_event;

  INSERT INTO public.client_leads
    (company_name, contact_name, phone, email, lead_status,
     next_action, next_action_date, next_action_time, next_action_type,
     calendar_event_id, contact_id)
  VALUES
    (p.client_name, NULL, p.client_phone, COALESCE(s.client_email, p.client_email), 'hot',
     CASE WHEN s.booked_via = 'prostor' THEN 'Konzultace z klientského prostoru'
          ELSE 'Konzultace domluvená z portálu' END,
     (s.scheduled_at AT TIME ZONE 'Europe/Prague')::date,
     (s.scheduled_at AT TIME ZONE 'Europe/Prague')::time,
     CASE WHEN s.channel = 'meet' THEN 'meeting' ELSE 'call' END,
     v_event, COALESCE(s.contact_id, p.contact_id))
  RETURNING id INTO v_lead;

  UPDATE public.calendar_events SET lead_id = v_lead WHERE id = v_event;
  UPDATE public.consultation_slots
  SET calendar_event_id = v_event,
      contact_id = COALESCE(contact_id, p.contact_id)
  WHERE id = s.id;

  RETURN v_event;
END;
$$;

-- ─── 4. Výskyty volna v rozsahu dnů ──────────────────────────────────────────
-- Kreslí je kalendář adminu a stojí na nich volné časy. Okamžiky se skládají
-- z pražského dne a času, takže opakování drží nástěnný čas i přes změnu
-- letního času.

CREATE OR REPLACE FUNCTION public.client_availability_occurrences(p_from date, p_to date)
RETURNS TABLE (
  availability_id uuid,
  day date,
  starts_at timestamptz,
  ends_at timestamptz,
  slot_minutes integer,
  repeat_weekly boolean,
  repeat_until date
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT a.id, d.day,
         (d.day + a.start_time) AT TIME ZONE 'Europe/Prague',
         (d.day + a.end_time) AT TIME ZONE 'Europe/Prague',
         a.slot_minutes, a.repeat_weekly, a.repeat_until
  FROM (
    SELECT gs::date AS day
    FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS gs
    -- Strop proti omylu: přes rok dnů najednou nepotřebuje žádný pohled.
    WHERE p_to >= p_from AND p_to - p_from <= 400
  ) d
  JOIN public.client_availability a
    ON d.day >= a.day
   AND CASE WHEN a.repeat_weekly
            THEN (d.day - a.day) % 7 = 0 AND (a.repeat_until IS NULL OR d.day <= a.repeat_until)
            ELSE d.day = a.day END
   AND NOT (d.day = ANY (a.skip_days))
  ORDER BY 3
$$;

-- ─── 5. Volné časy konzultací ────────────────────────────────────────────────
-- `p_ignore_slot` = rezervace, kterou klient přesouvá (její vlastní čas není
-- obsazený). Předstih 2 hodiny a horizont 92 dní platí vždy, ať volající pošle
-- cokoli.

CREATE OR REPLACE FUNCTION public.consultation_free_slots(
  p_from timestamptz,
  p_to timestamptz,
  p_ignore_slot uuid DEFAULT NULL
) RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH bounds AS (
    SELECT GREATEST(p_from, now() + interval '2 hours') AS lo,
           LEAST(p_to, now() + interval '92 days') AS hi
  ),
  windows AS (
    SELECT o.starts_at AS w_start, o.ends_at AS w_end, o.slot_minutes
    FROM bounds b,
         public.client_availability_occurrences(
           ((b.lo AT TIME ZONE 'Europe/Prague')::date),
           ((b.hi AT TIME ZONE 'Europe/Prague')::date)
         ) o
    WHERE b.lo < b.hi
  ),
  candidates AS (
    -- Dvě volna přes sebe dají tentýž začátek jen jednou (kratší délka vyhraje).
    SELECT DISTINCT ON (gs) gs AS starts_at, gs + make_interval(mins => w.slot_minutes) AS ends_at
    FROM windows w,
         generate_series(w.w_start, w.w_end - make_interval(mins => w.slot_minutes),
                         make_interval(mins => w.slot_minutes)) AS gs
    ORDER BY gs, w.slot_minutes
  )
  SELECT c.starts_at, c.ends_at
  FROM candidates c, bounds b
  WHERE c.starts_at >= b.lo
    AND c.starts_at < b.hi
    AND NOT EXISTS (
      SELECT 1 FROM public.calendar_events e
      WHERE e.starts_at < c.ends_at AND e.ends_at > c.starts_at
        AND (p_ignore_slot IS NULL OR e.consultation_slot_id IS DISTINCT FROM p_ignore_slot)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.consultation_slots cs
      WHERE cs.id IS DISTINCT FROM p_ignore_slot
        AND cs.scheduled_at < c.ends_at
        AND cs.scheduled_at + make_interval(mins => COALESCE(cs.duration_minutes, 60)) > c.starts_at
    )
    AND NOT EXISTS (
      -- Plánovaný hovor z Hovorů bez vlastní události zabere 30 minut.
      SELECT 1 FROM public.client_leads l
      WHERE l.calendar_event_id IS NULL
        AND l.next_action_date IS NOT NULL
        AND l.next_action_time IS NOT NULL
        AND l.lead_status NOT IN ('converted', 'lost')
        AND l.next_action_date BETWEEN (c.starts_at AT TIME ZONE 'Europe/Prague')::date - 1
                                   AND (c.starts_at AT TIME ZONE 'Europe/Prague')::date
        AND (l.next_action_date + l.next_action_time) AT TIME ZONE 'Europe/Prague' < c.ends_at
        AND (l.next_action_date + l.next_action_time) AT TIME ZONE 'Europe/Prague' + interval '30 minutes' > c.starts_at
    )
  ORDER BY c.starts_at
$$;

-- ─── 6. Rezervace, přesun a zrušení ──────────────────────────────────────────
-- Jediná cesta zápisu pro `/p` (vlastník tabulek) i `/klient` (přes úzké
-- funkce níž). Zámek serializuje rezervace i přesuny: druhá souběžná počká,
-- uvidí první a dostane `23P01`.

CREATE OR REPLACE FUNCTION public.consultation_book(
  p_project uuid,
  p_starts_at timestamptz,
  p_channel text,
  p_channel_other text,
  p_wish text,
  p_email text,
  p_meeting_link text,
  p_booked_via text,
  p_member uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_minutes integer;
  v_id uuid;
BEGIN
  IF p_booked_via IS NULL OR p_booked_via NOT IN ('odkaz', 'prostor') OR p_starts_at IS NULL THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.consultation_book'));

  SELECT round(extract(epoch FROM (f.ends_at - f.starts_at)) / 60)::integer INTO v_minutes
  FROM public.consultation_free_slots(p_starts_at, p_starts_at + interval '1 minute') f
  WHERE f.starts_at = p_starts_at;
  IF v_minutes IS NULL THEN
    RAISE EXCEPTION 'Tenhle čas už není volný.' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.consultation_slots
    (project_id, scheduled_at, channel, channel_other_text, client_wish, meeting_link, client_email,
     duration_minutes, booked_via, portal_member_id, meet_status)
  VALUES
    (p_project, p_starts_at, p_channel, p_channel_other, p_wish, p_meeting_link, p_email,
     v_minutes, p_booked_via, p_member, CASE WHEN p_channel = 'meet' THEN 'pending' END)
  RETURNING id INTO v_id;

  PERFORM public.admin_slot_ensure_event(v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consultation_move(p_slot uuid, p_starts_at timestamptz)
RETURNS TABLE (google_event_id text, minutes integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_minutes integer;
  v_event uuid;
  v_google text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.consultation_book'));

  SELECT cs.calendar_event_id INTO v_event FROM public.consultation_slots cs WHERE cs.id = p_slot FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT round(extract(epoch FROM (f.ends_at - f.starts_at)) / 60)::integer INTO v_minutes
  FROM public.consultation_free_slots(p_starts_at, p_starts_at + interval '1 minute', p_slot) f
  WHERE f.starts_at = p_starts_at;
  IF v_minutes IS NULL THEN
    RAISE EXCEPTION 'Tenhle čas už není volný.' USING ERRCODE = '23P01';
  END IF;

  UPDATE public.consultation_slots cs
  SET scheduled_at = p_starts_at,
      duration_minutes = v_minutes,
      reminder_day_before_sent = false,
      reminder_2h_before_sent = false,
      confirmation_sent_at = NULL,
      move_count = cs.move_count + 1
  WHERE cs.id = p_slot;

  IF v_event IS NOT NULL THEN
    UPDATE public.calendar_events e
    SET starts_at = p_starts_at,
        ends_at = p_starts_at + make_interval(mins => v_minutes)
    WHERE e.id = v_event
    RETURNING e.google_event_id INTO v_google;

    UPDATE public.client_leads l
    SET next_action_date = (p_starts_at AT TIME ZONE 'Europe/Prague')::date,
        next_action_time = (p_starts_at AT TIME ZONE 'Europe/Prague')::time,
        reminder_day_before_sent = false,
        reminder_2h_before_sent = false,
        updated_at = now()
    WHERE l.calendar_event_id = v_event;
  END IF;

  RETURN QUERY SELECT v_google, v_minutes;
END;
$$;

-- Smaže rezervaci, její událost a kontakt zrcadlený v Hovorech (stejně jako
-- smazání ruční události v kalendáři). Vrací id události v Googlu, ať ji
-- server smaže i tam.
CREATE OR REPLACE FUNCTION public.consultation_cancel(p_slot uuid) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_event uuid;
  v_google text;
BEGIN
  SELECT cs.calendar_event_id INTO v_event FROM public.consultation_slots cs WHERE cs.id = p_slot FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event IS NOT NULL THEN
    SELECT e.google_event_id INTO v_google FROM public.calendar_events e WHERE e.id = v_event;
    DELETE FROM public.client_leads l WHERE l.calendar_event_id = v_event;
    DELETE FROM public.calendar_events e WHERE e.id = v_event;
  END IF;
  DELETE FROM public.consultation_slots cs WHERE cs.id = p_slot;
  RETURN v_google;
END;
$$;

-- ─── 7. Projekce pro klienta ─────────────────────────────────────────────────
-- Jen konzultace zakázek propojených s klientem. Bez e-mailu, kontaktu,
-- textu kanálu „jiné" a odkazů, které nejsou Google Meet.

CREATE TABLE IF NOT EXISTS portal.consultations (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  project_id uuid NOT NULL,
  member_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  topic text NOT NULL,
  channel text NOT NULL,
  meet_url text CHECK (meet_url IS NULL OR meet_url LIKE 'https://meet.google.com/%'),
  meet_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, project_id) REFERENCES portal.projects (client_id, id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, member_id) REFERENCES portal.members (client_id, id) ON DELETE SET NULL (member_id)
);
CREATE INDEX IF NOT EXISTS portal_consultations_project_idx
  ON portal.consultations (client_id, project_id, starts_at);

ALTER TABLE portal.consultations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'portal' AND tablename = 'consultations' AND policyname = 'client_isolation') THEN
    CREATE POLICY client_isolation ON portal.consultations
      USING (client_id = portal.current_client()) WITH CHECK (client_id = portal.current_client());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION portal.put_consultation(p_slot uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  s record;
  v_client uuid;
  v_member uuid;
BEGIN
  SELECT cs.id, cs.project_id, cs.scheduled_at, cs.duration_minutes, cs.client_wish, cs.channel,
         cs.meeting_link, cs.meet_status, cs.portal_member_id, cs.created_at
  INTO s FROM public.consultation_slots cs WHERE cs.id = p_slot;
  IF NOT FOUND THEN
    DELETE FROM portal.consultations WHERE id = p_slot;
    RETURN;
  END IF;

  SELECT pp.client_id INTO v_client FROM portal.projects pp WHERE pp.id = s.project_id;
  IF v_client IS NULL THEN
    DELETE FROM portal.consultations WHERE id = p_slot;
    RETURN;
  END IF;
  SELECT m.id INTO v_member FROM portal.members m WHERE m.id = s.portal_member_id AND m.client_id = v_client;

  INSERT INTO portal.consultations
    (id, client_id, project_id, member_id, starts_at, ends_at, topic, channel, meet_url, meet_pending, created_at)
  VALUES
    (s.id, v_client, s.project_id, v_member, s.scheduled_at,
     s.scheduled_at + make_interval(mins => COALESCE(s.duration_minutes, 60)),
     left(COALESCE(s.client_wish, ''), 1000),
     CASE WHEN s.channel IN ('whatsapp', 'teams', 'meet', 'phone') THEN s.channel ELSE 'other' END,
     CASE WHEN s.meeting_link LIKE 'https://meet.google.com/%' THEN s.meeting_link END,
     COALESCE(s.meet_status IN ('pending', 'creating'), false),
     COALESCE(s.created_at, now()))
  ON CONFLICT (id) DO UPDATE
    SET client_id = EXCLUDED.client_id, project_id = EXCLUDED.project_id, member_id = EXCLUDED.member_id,
        starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, topic = EXCLUDED.topic,
        channel = EXCLUDED.channel, meet_url = EXCLUDED.meet_url, meet_pending = EXCLUDED.meet_pending;
END
$$;

CREATE OR REPLACE FUNCTION portal.sync_consultation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM portal.put_consultation(OLD.id);
  ELSE
    PERFORM portal.put_consultation(NEW.id);
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS portal_sync_consultation ON public.consultation_slots;
CREATE TRIGGER portal_sync_consultation
  AFTER INSERT OR UPDATE OR DELETE ON public.consultation_slots
  FOR EACH ROW EXECUTE FUNCTION portal.sync_consultation();

-- Zakázka propojená s klientem později: její konzultace se doplní. Trigger na
-- `portal.projects` místo dalšího přepsání `portal.link_project` (095→121→122).
CREATE OR REPLACE FUNCTION portal.backfill_consultations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  PERFORM portal.put_consultation(cs.id) FROM public.consultation_slots cs WHERE cs.project_id = NEW.id;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS portal_backfill_consultations ON portal.projects;
CREATE TRIGGER portal_backfill_consultations
  AFTER INSERT ON portal.projects
  FOR EACH ROW EXECUTE FUNCTION portal.backfill_consultations();

-- ─── 8. Úzké funkce pro klienta (role portal_app) ────────────────────────────

-- Volné časy: jen začátek a konec, nic o tom, čím je zbytek obsazený.
CREATE OR REPLACE FUNCTION portal.free_consultation_slots(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  IF portal.current_client() IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
    SELECT f.starts_at, f.ends_at
    FROM public.consultation_free_slots(p_from, LEAST(p_to, p_from + interval '92 days')) f;
END
$$;

-- Rezervace z prostoru: vždy Google Meet, potvrzení na e-mail člena.
CREATE OR REPLACE FUNCTION portal.book_consultation(p_project uuid, p_member uuid, p_starts_at timestamptz, p_topic text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
DECLARE
  cid uuid := portal.assert_member_project(p_project, p_member);
  v_email text;
BEGIN
  IF p_starts_at IS NULL OR p_topic IS NULL OR char_length(btrim(p_topic)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.consultation_slots cs
      WHERE cs.portal_member_id = p_member AND cs.created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;
  SELECT m.email INTO v_email FROM portal.members m WHERE m.id = p_member AND m.client_id = cid;
  RETURN public.consultation_book(p_project, p_starts_at, 'meet', NULL, btrim(p_topic), v_email, NULL, 'prostor', p_member);
END
$$;

-- Společná kontrola pro přesun a zrušení: konzultace patří klientovi, člen je
-- jeho a do začátku zbývá víc než 24 hodin.
CREATE OR REPLACE FUNCTION portal.assert_changeable_consultation(p_consultation uuid, p_member uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, portal AS $$
DECLARE
  cid uuid := portal.current_client();
  c record;
BEGIN
  SELECT pc.project_id, pc.starts_at INTO c
  FROM portal.consultations pc WHERE pc.id = p_consultation AND pc.client_id = cid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM portal.assert_member_project(c.project_id, p_member);
  IF c.starts_at <= now() + interval '24 hours' THEN
    RAISE EXCEPTION 'too_late' USING ERRCODE = 'P0422';
  END IF;
  RETURN c.project_id;
END
$$;

CREATE OR REPLACE FUNCTION portal.move_consultation(p_consultation uuid, p_member uuid, p_starts_at timestamptz)
RETURNS TABLE (google_event_id text, minutes integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  PERFORM portal.assert_changeable_consultation(p_consultation, p_member);
  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'invalid' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT cs.move_count FROM public.consultation_slots cs WHERE cs.id = p_consultation) >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0429';
  END IF;
  RETURN QUERY SELECT m.google_event_id, m.minutes FROM public.consultation_move(p_consultation, p_starts_at) m;
END
$$;

CREATE OR REPLACE FUNCTION portal.cancel_consultation(p_consultation uuid, p_member uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, portal, public AS $$
BEGIN
  PERFORM portal.assert_changeable_consultation(p_consultation, p_member);
  RETURN public.consultation_cancel(p_consultation);
END
$$;

-- ─── 9. Kdo smí co spustit ───────────────────────────────────────────────────
-- Funkce mají výchozí EXECUTE pro PUBLIC; klient (portal_app) dostane jen
-- funkce z `scripts/portal-grants.sql`.

REVOKE ALL ON FUNCTION public.client_availability_occurrences(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultation_free_slots(timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultation_book(uuid, timestamptz, text, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultation_move(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultation_cancel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.put_consultation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.sync_consultation() FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.backfill_consultations() FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.free_consultation_slots(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.book_consultation(uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.assert_changeable_consultation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.move_consultation(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal.cancel_consultation(uuid, uuid) FROM PUBLIC;

-- ─── 10. Doplnění pro zakázky, které už s klientem propojené jsou ────────────

SELECT portal.put_consultation(cs.id)
FROM public.consultation_slots cs
JOIN portal.projects pp ON pp.id = cs.project_id;

ANALYZE public.consultation_slots;
