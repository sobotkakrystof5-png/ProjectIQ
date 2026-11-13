-- Migrace 112 (AD16): dotazník sám od sebe, předávací dokument, AI leady
--
-- (110 zabral AD14, 111 AD15 — viz R-100 a R-101.)
--
-- Aditivní a idempotentní: jen nové sloupce a indexy, nic se nepřejmenovává
-- ani nemaže, takže se smí pustit i před nasazením větve. Bez ní běží admin
-- dál — dotazník se pošle jako dosud při uzavření zakázky, předávací dokument
-- a pruh AI leadů se neukážou (kód to pozná podle `42703`/`42P01` a řekne to
-- česky).
--
-- ── Proč stopa po dotazníku patří zakázce, ne `project_surveys` ────────
--
-- `project_surveys` je **odpověď** klienta: hvězdičky jsou `NOT NULL` a od
-- migrace 106 smí být na zakázku nejvýš jedna (`project_surveys_project_uq`).
-- Dokud klient nevyplnil, žádný řádek neexistuje — a „kdy jsme se zeptali"
-- je potřeba vědět právě tehdy. Zakládat prázdný řádek dopředu by znamenalo
-- buď povolit NULL u hodnocení (a rozbít tím smysl tabulky), nebo vyplnit
-- nuly, které by lezly do průměrů. Proto `projects.survey_*`.

-- ─── 1. Dotazník spokojenosti: kdy odešel a kdy se připomnělo ────────────────
-- `survey_requested_at` se zapisuje **v okamžiku odeslání**, ne při uzavření:
-- mezi uzavřením a odesláním je okno na „Zpět" (15 s), ve kterém se e-mail
-- ještě ruší. Zároveň je to zámek proti dvojímu odeslání — nastavuje ho týž
-- UPDATE, který řádek vybere (stejný princip jako u připomínek konzultací).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS survey_requested_at timestamptz;
-- Jedna připomínka po sedmi dnech. Pak už nic — druhá by byla otravování.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS survey_reminded_at  timestamptz;

-- Denní cron se ptá „komu odešel dotazník, kdo nepřipomenutý a bez odpovědi".
-- Částečný index: zakázek bez odeslaného dotazníku je většina a ty hledat
-- nepotřebuje.
CREATE INDEX IF NOT EXISTS projects_survey_pending_idx
  ON projects (survey_requested_at)
  WHERE survey_requested_at IS NOT NULL AND survey_reminded_at IS NULL;

-- ─── 2. Předávací dokument „co bylo dodané" ──────────────────────────────────
-- Obsah je `jsonb`, ne pět sloupců: je to seznam položek, přístupů a dvou
-- seznamů k údržbě, a jeho tvar hlídá Zod v `lib/admin/handover.ts`. Do
-- databáze se dostane jen text, který prošel `redactSensitive()` — heslo ani
-- klíč se do předávacího dokumentu nepíše, od toho je správce hesel.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS handover jsonb;
-- Kdy se dokument naposledy vystavil. Plní krok „Předáno" v průvodce (AD11).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS handover_issued_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_handover_object_check') THEN
    -- Pojistka proti poli nebo řetězci v `handover`: čtení počítá s objektem.
    ALTER TABLE projects ADD CONSTRAINT projects_handover_object_check
      CHECK (handover IS NULL OR jsonb_typeof(handover) = 'object') NOT VALID;
  END IF;
END
$$;

-- ─── 3. AI leady: co s nimi je vyřízené ──────────────────────────────────────
-- `agent_leads` se od migrace 052 plní z vizeon-lead-agent a **nikdo je
-- neviděl** — v kódu byl jediný výskyt, INSERT v route handleru. Aby šly
-- v Hovorech ukázat jako pruh, potřebují stopu, co už někdo vyřídil; jinak
-- by seznam rostl donekonečna.
--
-- Pozor na jméno: `agent_leads.lead_id` je **text** a patří agentovi (jeho
-- klíč pro idempotenci). Odkaz na kontakt v Hovorech je proto `client_lead_id`.
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS handled_at      timestamptz;
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS client_lead_id  uuid REFERENCES client_leads(id) ON DELETE SET NULL;
ALTER TABLE agent_leads ADD COLUMN IF NOT EXISTS project_id      uuid REFERENCES projects(id)     ON DELETE SET NULL;

-- Pruh v Hovorech: nevyřízené, nejvyšší skóre nahoře.
CREATE INDEX IF NOT EXISTS agent_leads_open_idx
  ON agent_leads (lead_score DESC, received_at DESC)
  WHERE handled_at IS NULL;

ANALYZE projects;
ANALYZE agent_leads;
