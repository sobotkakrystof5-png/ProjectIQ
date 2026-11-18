-- Migrace 118: dotazník spokojenosti na jednu minutu (R-119)
--
-- Dotazník měl šest povinných hvězdičkových otázek, které se překrývaly
-- (Spolupráce × Spolehlivost × Flexibilita) a nesedly na e-shop ani na
-- automatizaci. Nově:
--  - jediná povinná otázka je „Doporučili byste mě?" (0–10, NPS) a ukládá se
--    hned po kliknutí, i když klient zbytek nevyplní,
--  - čtyři nepovinné oblasti: výsledek, komunikace, termín, cena za výsledek,
--  - text podle známky (co zlepšit / reference),
--  - souhlas se zveřejněním ve třech úrovních (se jménem, bez jména, nezveřejňovat),
--  - u nespokojených stopa, jestli se jim Kryštof už ozval.
--
-- Aditivní a idempotentní, smí jít **před** nasazením: starý build dál vkládá
-- všech šest starých hvězdiček a nové sloupce nechá prázdné. Bez ní nový
-- dotazník neuloží odpověď, proto musí proběhnout **před** nasazením větve.

-- ─── 1. Nové odpovědi ────────────────────────────────────────────────────────
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS nps                  smallint;
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS rating_result        smallint;
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS rating_communication smallint;
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS rating_schedule      smallint;
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS rating_value         smallint;
-- „Co by z toho udělalo desítku?" (7–8) a „Co jsem měl udělat jinak?" (0–6).
-- Reference zůstává v `reference_text`.
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS improve_text  text;
-- named = se jménem a firmou, anonymous = bez jména, private = nezveřejňovat.
-- `consent` zůstává a drží se v souladu (named/anonymous = true), ať starý
-- kód i reference čtou tutéž pravdu.
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS publish_mode  text;
-- Firma nebo pozice pro referenci se jménem („majitelka kadeřnictví").
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS reviewer_role text;

-- ─── 2. Stav vyplňování ──────────────────────────────────────────────────────
-- Řádek vzniká už známkou z e-mailu; `completed_at` je odeslání celého
-- formuláře. Do té doby smí klient známku změnit, potom už nic.
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS updated_at   timestamptz;
-- Upozornění na nespokojeného klienta odešlo (jednou) a Kryštof se mu ozval.
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS detractor_alerted_at timestamptz;
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS followed_up_at       timestamptz;
-- Klient klikl na „Napsat recenzi na Googlu" (jestli ji opravdu napsal, Google neřekne).
ALTER TABLE project_surveys ADD COLUMN IF NOT EXISTS google_review_clicked_at timestamptz;

-- Staré dotazníky byly vždy vyplněné celé — dostanou datum dokončení, ať je
-- nový formulář nepřepíše.
UPDATE project_surveys SET completed_at = created_at
WHERE completed_at IS NULL AND nps IS NULL AND rating_cooperation IS NOT NULL;

-- ─── 3. Staré hvězdičky přestávají být povinné ───────────────────────────────
-- Historie zůstává, nové odpovědi je nevyplňují.
ALTER TABLE project_surveys ALTER COLUMN rating_cooperation   DROP NOT NULL;
ALTER TABLE project_surveys ALTER COLUMN rating_speed         DROP NOT NULL;
ALTER TABLE project_surveys ALTER COLUMN rating_design        DROP NOT NULL;
ALTER TABLE project_surveys ALTER COLUMN rating_functionality DROP NOT NULL;
ALTER TABLE project_surveys ALTER COLUMN rating_reliability   DROP NOT NULL;
ALTER TABLE project_surveys ALTER COLUMN rating_flexibility   DROP NOT NULL;

-- ─── 4. Rozsahy hodnot ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_surveys_nps_range') THEN
    ALTER TABLE project_surveys ADD CONSTRAINT project_surveys_nps_range
      CHECK (nps IS NULL OR nps BETWEEN 0 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_surveys_areas_range') THEN
    ALTER TABLE project_surveys ADD CONSTRAINT project_surveys_areas_range CHECK (
      (rating_result        IS NULL OR rating_result        BETWEEN 1 AND 5) AND
      (rating_communication IS NULL OR rating_communication BETWEEN 1 AND 5) AND
      (rating_schedule      IS NULL OR rating_schedule      BETWEEN 1 AND 5) AND
      (rating_value         IS NULL OR rating_value         BETWEEN 1 AND 5)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_surveys_publish_mode_check') THEN
    ALTER TABLE project_surveys ADD CONSTRAINT project_surveys_publish_mode_check
      CHECK (publish_mode IS NULL OR publish_mode IN ('named', 'anonymous', 'private'));
  END IF;
  -- Odpověď bez jediné známky nedává smysl: buď nová (NPS), nebo stará (hvězdičky).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_surveys_has_answer') THEN
    ALTER TABLE project_surveys ADD CONSTRAINT project_surveys_has_answer
      CHECK (nps IS NOT NULL OR rating_cooperation IS NOT NULL);
  END IF;
END $$;

-- Nespokojení, kterým se ještě nikdo neozval — seznam v Hodnocení.
CREATE INDEX IF NOT EXISTS project_surveys_detractors_idx
  ON project_surveys (created_at DESC)
  WHERE nps <= 6 AND followed_up_at IS NULL;

-- ─── 5. Odkaz na Google recenzi ──────────────────────────────────────────────
-- Jedno pole v Profilu. Ukáže se jen spokojeným (9–10) po odeslání.
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS google_review_url text;
