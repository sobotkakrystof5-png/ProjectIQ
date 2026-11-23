-- Migrace 120: doplnění calendar_events.lead_id u událostí z kalendáře
--
-- Do 2026-11-18 zakládal `insertEvent` (app/calendar-actions.ts) událost
-- a kontakt v Hovorech jedním příkazem s CTE a `lead_id` doplňoval závěrečným
-- UPDATE. Ten ale řádek vložený v tomtéž příkazu nevidí, takže každá událost
-- založená z kalendáře (i od asistenta) zůstala s `lead_id = NULL`. Kontakt
-- v Hovorech na ni ukazuje jen přes `client_leads.calendar_event_id`.
--
-- Kód od opravy čte dvojici z obou stran, takže tahle migrace jen srovná data
-- pro ostatní místa, která čtou `lead_id` (paměť projektu, schůzky).
--
-- Jen doplňuje prázdné hodnoty, nic nemaže a jde pustit kdykoli a opakovaně
-- (před nasazením i po něm). Po řádcích, protože UPDATE spouští překryvový
-- guard z migrace 008/105: případný starý překryv přeskočí s upozorněním,
-- místo aby shodil celou migraci.

DO $$
DECLARE
  r record;
  hotovo integer := 0;
  preskoceno integer := 0;
BEGIN
  FOR r IN
    SELECT e.id AS event_id, l.id AS lead_id
    FROM calendar_events e
    JOIN client_leads l ON l.calendar_event_id = e.id
    WHERE e.lead_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM calendar_events x WHERE x.lead_id = l.id)
  LOOP
    BEGIN
      UPDATE calendar_events SET lead_id = r.lead_id WHERE id = r.event_id AND lead_id IS NULL;
      hotovo := hotovo + 1;
    EXCEPTION WHEN OTHERS THEN
      preskoceno := preskoceno + 1;
      RAISE WARNING 'calendar_events % nedostala lead_id: %', r.event_id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Doplněno lead_id u % událostí, přeskočeno %.', hotovo, preskoceno;
END
$$;
