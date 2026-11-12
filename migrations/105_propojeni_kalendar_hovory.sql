-- Migrace 105: kalendář, Hovory a rezervace z portálu drží jeden čas (AD10)
--
-- Tři rozpady, které tahle migrace zavírá:
--
-- 1. **Čas leadu a čas termínu se rozcházely.** `updateLead` přepsal
--    `client_leads.next_action_date/time`, ale `calendar_events.starts_at`
--    nechal, jak byl. Dvojice z migrace 051 tak po každém přesunu v Hovorech
--    lhala: v kalendáři stál termín na starém čase. Nová funkce
--    `admin_lead_reschedule` přepíše oba jedním příkazem.
-- 2. **Rezervace z portálu nebyla v Hovorech.** `consultation_slots` je
--    třetí časová tabulka, kterou kalendář kreslí zvlášť a Hovory neznají
--    vůbec — domluvená konzultace se tedy neobjevila mezi hovory, které má
--    kdo vyřídit. Rezervace teď v téže transakci zakládá i kalendářní
--    událost a přes ni zrcadlený lead (stejná dvojice jako u ručního termínu).
-- 3. **Křížový překryvový guard neznal dvojice.** Trigger z migrace 044
--    hlásí překryv mezi `calendar_events` a `consultation_slots` — tedy i
--    mezi rezervací a její *vlastní* událostí. Bez výjimky pro dvojici by
--    párování spadlo na `23P01` samo o sobě.
--
-- Aditivní a idempotentní. **Starý build adminu nerozbije**: nové sloupce
-- jsou nullable, obě nahrazené trigger funkce se při `NEW.consultation_slot_id
-- IS NULL` chovají úplně stejně jako dosud (`id IS DISTINCT FROM NULL` je pro
-- každý existující řádek pravda), takže se smí aplikovat i před nasazením
-- větve. Na rozdíl od 102 na nic nečeká.

-- ─── 1. Dvojice rezervace ↔ kalendářní událost ───────────────────────────────
-- Obousměrný nullable pár, přesně jako `calendar_events.lead_id` ×
-- `client_leads.calendar_event_id` z migrace 051. Dvě strany to mají proto,
-- že **guard musí dvojici poznat v okamžiku vkládání události**, kdy rezervace
-- ještě na nic neukazuje: odkaz proto nese vkládaný řádek
-- (`calendar_events.consultation_slot_id`) a strana rezervace se doplní hned
-- po něm, aby se slot dal přečíst i odtamtud.
ALTER TABLE consultation_slots
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS consultation_slot_id uuid REFERENCES consultation_slots(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS consultation_slots_calendar_event_key
  ON consultation_slots (calendar_event_id) WHERE calendar_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_consultation_slot_key
  ON calendar_events (consultation_slot_id) WHERE consultation_slot_id IS NOT NULL;

-- ─── 2. Guard z migrace 044 zná dvojici ──────────────────────────────────────
-- Jediná změna proti 044 je `IS DISTINCT FROM` na druhé straně dvojice.
-- Vlastní rezervace není překryv; cizí dál je.
CREATE OR REPLACE FUNCTION check_calendar_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.calendar_events
    WHERE id <> NEW.id
      AND starts_at < NEW.ends_at
      AND ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou událostí v kalendáři.'
      USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.consultation_slots
    WHERE scheduled_at >= NEW.starts_at
      AND scheduled_at < NEW.ends_at
      -- Rezervace, ke které tahle událost patří, není kolize sama se sebou.
      AND id IS DISTINCT FROM NEW.consultation_slot_id
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou konzultací.'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_consultation_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.calendar_events
    WHERE starts_at <= NEW.scheduled_at
      AND ends_at > NEW.scheduled_at
      AND id IS DISTINCT FROM NEW.calendar_event_id
  ) THEN
    RAISE EXCEPTION 'Tento termín se překrývá s jinou událostí v kalendáři.'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. Přesun termínu píše na obě strany ────────────────────────────────────
-- `p_starts_at` i `p_ends_at` jsou okamžiky — pražskou nástěnnou hodinu z nich
-- skládá `pragueWallClockToISO` v `lib/prague-time.ts`, tady se jen rozpadá
-- zpátky na `date` + `time`, které `client_leads` od migrace 017 drží. Je to
-- **projekce, ne podmínka** (obrácený směr téhož převodu, který dělá dotaz
-- Hovorů v `lib/admin/calendar.ts`), takže žádný index tím nepadá.
--
-- `p_ends_at => NULL` znamená „nech termín stejně dlouhý" — volající nemusí
-- kvůli přesunu nejdřív čístat délku události.
--
-- Vzor `ws.money_issue` (migrace 080): zámek na řádku, jeden příkaz, žádné
-- „přečti a pak zapiš" mezi dvěma požadavky.
CREATE OR REPLACE FUNCTION admin_lead_reschedule(
  p_lead uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_event uuid;
  v_date date;
  v_time time;
BEGIN
  IF p_starts_at IS NULL THEN
    RAISE EXCEPTION 'Přesun termínu potřebuje čas začátku.';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Čas konce musí být po čase začátku.';
  END IF;

  SELECT calendar_event_id INTO v_event
  FROM public.client_leads WHERE id = p_lead FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontakt nenalezen.';
  END IF;

  v_date := (p_starts_at AT TIME ZONE 'Europe/Prague')::date;
  v_time := (p_starts_at AT TIME ZONE 'Europe/Prague')::time;

  -- Připomínky se nulují **jen při skutečné změně času**. Bez té podmínky by
  -- uložení poznámky u kontaktu poslalo připomínku termínu podruhé.
  UPDATE public.client_leads
  SET next_action_date = v_date,
      next_action_time = v_time,
      reminder_day_before_sent = CASE
        WHEN next_action_date IS DISTINCT FROM v_date OR next_action_time IS DISTINCT FROM v_time
        THEN false ELSE reminder_day_before_sent END,
      reminder_2h_before_sent = CASE
        WHEN next_action_date IS DISTINCT FROM v_date OR next_action_time IS DISTINCT FROM v_time
        THEN false ELSE reminder_2h_before_sent END,
      updated_at = now()
  WHERE id = p_lead;

  IF v_event IS NOT NULL THEN
    -- `IS DISTINCT FROM` drží zápis i překryvový guard mimo hru, když se čas
    -- nemění (uložení poznámky u kontaktu s termínem).
    UPDATE public.calendar_events
    SET starts_at = p_starts_at,
        ends_at = COALESCE(p_ends_at, p_starts_at + (ends_at - starts_at))
    WHERE id = v_event
      AND (starts_at IS DISTINCT FROM p_starts_at
           OR (p_ends_at IS NOT NULL AND ends_at IS DISTINCT FROM p_ends_at));
  END IF;

  RETURN v_event;
END;
$$;

-- ─── 4. Rezervace z portálu se zrcadlí do kalendáře i do Hovorů ──────────────
-- Idempotentní: slot, který už dvojici má, se jen vrátí. Pořadí zápisů je
-- dané guardem — rezervace existuje první (její trigger kontroluje cizí
-- události), pak se vloží událost s odkazem na ni (guard tuhle rezervaci
-- přeskočí) a nakonec se doplní zpětné odkazy.
--
-- Kontakt se tu **nezakládá**: bere se ten, který má zakázka (AD09). Veřejný
-- vstup z portálu tím nikdy nezaloží nový řádek v `contacts`.
CREATE OR REPLACE FUNCTION admin_slot_ensure_event(p_slot uuid) RETURNS uuid
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
  SELECT id, project_id, scheduled_at, client_wish, client_email, contact_id, calendar_event_id
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
    (v_title, s.client_wish, s.scheduled_at, s.scheduled_at + interval '1 hour', 'manual',
     s.project_id, COALESCE(p.lead_origin, 'vizeon'), s.id)
  RETURNING id INTO v_event;

  -- Zrcadlený lead je tentýž vzor jako u ručního termínu (051): Hovory tak
  -- rezervaci vidí mezi ostatními hovory a kalendář ji z `client_leads`
  -- nekreslí podruhé (lead s `calendar_event_id` je z dotazu kalendáře venku).
  INSERT INTO public.client_leads
    (company_name, contact_name, phone, email, lead_status,
     next_action, next_action_date, next_action_time, next_action_type,
     calendar_event_id, contact_id)
  VALUES
    (p.client_name, NULL, p.client_phone, COALESCE(s.client_email, p.client_email), 'hot',
     'Konzultace domluvená z portálu',
     (s.scheduled_at AT TIME ZONE 'Europe/Prague')::date,
     (s.scheduled_at AT TIME ZONE 'Europe/Prague')::time,
     'call', v_event, COALESCE(s.contact_id, p.contact_id))
  RETURNING id INTO v_lead;

  UPDATE public.calendar_events SET lead_id = v_lead WHERE id = v_event;
  UPDATE public.consultation_slots
  SET calendar_event_id = v_event,
      contact_id = COALESCE(contact_id, p.contact_id)
  WHERE id = s.id;

  RETURN v_event;
END;
$$;

-- ─── 5. Rezervace, které už v databázi leží ──────────────────────────────────
-- Jen **budoucí** termíny: historická konzultace kalendářní událost
-- nepotřebuje a zpětné zakládání by zvýšilo riziko kolize s dávno zapsanou
-- událostí. Každý slot zvlášť, aby jedna kolize nezhodila celou migraci
-- (spuštění podruhé nic nepřidá — `admin_slot_ensure_event` je idempotentní).
DO $$
DECLARE
  r record;
  hotovo int := 0;
  preskoceno int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.consultation_slots
    WHERE calendar_event_id IS NULL AND scheduled_at > now()
    ORDER BY scheduled_at
  LOOP
    BEGIN
      PERFORM public.admin_slot_ensure_event(r.id);
      hotovo := hotovo + 1;
    EXCEPTION WHEN others THEN
      preskoceno := preskoceno + 1;
      RAISE NOTICE 'rezervace % se nespárovala: %', r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'spárováno rezervací: %, přeskočeno: %', hotovo, preskoceno;
END $$;

ANALYZE consultation_slots;
ANALYZE calendar_events;
