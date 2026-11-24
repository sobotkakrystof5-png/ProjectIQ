-- Migrace 130: jeden klient, jedny údaje (R-141)
--
-- E-mail a telefon klienta žily na pěti místech zvlášť: firma od AI asistenta
-- (`outreach_leads`), kontakt (`contacts`), Hovory (`client_leads`), zakázka
-- (`projects`) a schůzka (`calendar_events.invite_to`, `meeting_phone`).
-- Když Growth OS poslal e-mail, do Hovorů ani do okna schůzky se nedostal,
-- a oprava v Kontaktech zůstala jen v Kontaktech.
--
-- Od teď je **kontakt jediný zdroj** a kód (`lib/admin/contact-sync.ts`)
-- propisuje změnu dál. Tahle migrace k tomu přidává vazbu firmy od asistenta
-- na kontakt a jednou srovná, co už v databázi je:
--   1. firma od asistenta dostane kontakt, se kterým je propojená přes Hovory,
--   2. firma, která řekla ano ukázce, a kontakt ještě nemá, ho dostane
--      (najde se podle telefonu, pak e-mailu; jinak vznikne nový),
--   3. kontakt bez e-mailu nebo telefonu si je vezme od své firmy,
--   4. Hovory a zakázky bez e-mailu nebo telefonu si je vezmou od kontaktu.
-- Vyplněný údaj se **nikde nepřepisuje** — jen prázdná místa.
--
-- Doklady (faktury, předávací dokumenty) se nemění: nesou údaje z doby vystavení.
--
-- Aditivní a idempotentní, smí jít před nasazením i po něm. Starý build sloupec
-- nezná; nový build bez migrace běží dál a firmu s kontaktem spojí přes Hovory.

-- ─── 1. Vazba firmy od asistenta na kontakt ─────────────────────────────────
ALTER TABLE outreach_leads
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS outreach_leads_contact_idx
  ON outreach_leads (contact_id) WHERE contact_id IS NOT NULL;

-- Firma převzatá do Hovorů: kontakt je ten, na který ukazuje řádek v Hovorech.
UPDATE outreach_leads o
   SET contact_id = coalesce(c.merged_into, c.id)
  FROM client_leads l
  JOIN contacts c ON c.id = l.contact_id
 WHERE o.client_lead_id = l.id
   AND o.contact_id IS NULL;

-- ─── 2. Kontakt pro firmy, které řekly ano ──────────────────────────────────
-- Stejné stavy jako `ACCEPTED_STATUSES` v `lib/admin/outreach-crm-view.ts`.
-- Po řádcích: telefon nebo e-mail už může mít jiný kontakt (unique z 104),
-- a takový kontakt se použije, místo aby vznikl druhý.
DO $$
DECLARE
  r record;
  found_id uuid;
  hotovo int := 0;
BEGIN
  FOR r IN
    SELECT id, company_name, contact_name, phone, lower(btrim(email)) AS email
      FROM outreach_leads
     WHERE contact_id IS NULL
       AND (phone IS NOT NULL OR nullif(btrim(email), '') IS NOT NULL)
       AND (status = ANY ('{accepted,meeting_booked,demo_building,demo_ready,email_sent,email_opened,demo_viewed,replied,meeting_held,won}'::text[])
            OR demo_url IS NOT NULL
            OR client_lead_id IS NOT NULL)
  LOOP
    BEGIN
      SELECT x.id INTO found_id FROM (
        SELECT coalesce(merged_into, id) AS id, 1 AS poradi FROM contacts WHERE r.phone IS NOT NULL AND phone = r.phone
        UNION ALL
        SELECT coalesce(merged_into, id), 2 FROM contacts
         WHERE r.email IS NOT NULL AND email IS NOT NULL AND lower(email) = r.email
      ) x ORDER BY x.poradi LIMIT 1;

      IF found_id IS NULL THEN
        INSERT INTO contacts (display_name, company, email, phone, source, last_seen_at)
        VALUES (coalesce(nullif(btrim(r.contact_name), ''), r.company_name), r.company_name,
                nullif(r.email, ''), r.phone, 'growth-os', now())
        RETURNING id INTO found_id;
      END IF;

      UPDATE outreach_leads SET contact_id = found_id WHERE id = r.id;
      hotovo := hotovo + 1;
    EXCEPTION WHEN unique_violation OR check_violation THEN
      RAISE WARNING 'Firma % nedostala kontakt: %', r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Kontakt dostalo % firem od asistenta.', hotovo;
END
$$;

-- ─── 3. Kontakt si vezme chybějící údaje od své firmy ───────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (c.id) c.id, lower(btrim(o.email)) AS email, o.phone
      FROM contacts c
      JOIN outreach_leads o ON o.contact_id = c.id
     WHERE c.merged_into IS NULL
       AND ((c.email IS NULL AND nullif(btrim(o.email), '') IS NOT NULL) OR (c.phone IS NULL AND o.phone IS NOT NULL))
     ORDER BY c.id, o.source_updated_at DESC
  LOOP
    BEGIN
      UPDATE contacts c
         SET email = CASE
               WHEN c.email IS NULL AND r.email IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id
                                   AND d.email IS NOT NULL AND lower(d.email) = r.email)
               THEN r.email ELSE c.email END,
             phone = CASE
               WHEN c.phone IS NULL AND r.phone IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM contacts d WHERE d.merged_into IS NULL AND d.id <> c.id AND d.phone = r.phone)
               THEN r.phone ELSE c.phone END
       WHERE c.id = r.id;
    EXCEPTION WHEN unique_violation OR check_violation THEN
      RAISE WARNING 'Kontakt % si údaje od firmy nevzal: %', r.id, SQLERRM;
    END;
  END LOOP;
END
$$;

-- ─── 4. Hovory a zakázky si vezmou chybějící údaje od kontaktu ──────────────
UPDATE client_leads l
   SET email = c.email
  FROM contacts s
  JOIN contacts c ON c.id = coalesce(s.merged_into, s.id)
 WHERE l.contact_id = s.id
   AND nullif(btrim(l.email), '') IS NULL
   AND c.email IS NOT NULL;

UPDATE client_leads l
   SET phone = c.phone
  FROM contacts s
  JOIN contacts c ON c.id = coalesce(s.merged_into, s.id)
 WHERE l.contact_id = s.id
   AND nullif(btrim(l.phone), '') IS NULL
   AND c.phone IS NOT NULL;

UPDATE projects p
   SET client_email = c.email
  FROM contacts s
  JOIN contacts c ON c.id = coalesce(s.merged_into, s.id)
 WHERE p.contact_id = s.id
   AND nullif(btrim(p.client_email), '') IS NULL
   AND c.email IS NOT NULL;

UPDATE projects p
   SET client_phone = c.phone
  FROM contacts s
  JOIN contacts c ON c.id = coalesce(s.merged_into, s.id)
 WHERE p.contact_id = s.id
   AND nullif(btrim(p.client_phone), '') IS NULL
   AND c.phone IS NOT NULL;

-- Hovory převzaté od asistenta bez kontaktu: aspoň údaje od firmy.
UPDATE client_leads l
   SET email = coalesce(nullif(btrim(l.email), ''), nullif(btrim(o.email), '')),
       phone = coalesce(nullif(btrim(l.phone), ''), o.phone)
  FROM outreach_leads o
 WHERE o.client_lead_id = l.id
   AND ((nullif(btrim(l.email), '') IS NULL AND nullif(btrim(o.email), '') IS NOT NULL)
     OR (nullif(btrim(l.phone), '') IS NULL AND o.phone IS NOT NULL));
