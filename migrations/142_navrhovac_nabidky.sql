-- Migrace 142: navrhovač nabídek, kroky N2–N4 (R-147, R-155, docs/admin/NABIDKY-PLAN.md)
--
-- N2: z rozboru firmy (offer_research) vznikne návrh nabídky se třemi
-- variantami. Ceny počítá server z cenových pravidel (admin_settings.pricing_rules),
-- model dodá jen odhad hodnoty pro klienta, pozici v pásmu a obsah variant.
-- Kryštof návrh upraví a pošle, klient na stránce /nabidka/<token> vybere variantu.
--
-- N3: k nabídce se zapisuje výsledek. Výběr varianty na stránce, zakázka
-- u kontaktu (trigger níž) a 14 dní bez odpovědi (denní cron) se zapíšou samy,
-- Kryštof kliká jen „odmítl" a „smlouval". Měsíční vyhodnocení navrhne úpravy
-- pravidel do offer_rule_suggestions, platí až po jeho potvrzení.
--
-- N4: odhad poptávek z webu se porovná s project_web_events (KP17). Žádná tabulka navíc.
--
-- Retence (D-N5): nabídka bez zakázky 12 měsíců od poslední změny, smazání
-- kontaktu ji smaže s ním (cizí klíč). Úklid purge_offer_proposals() v cronu client-retention.
--
-- Idempotentní: druhý běh nic nezmění. Aditivní, starý build ji nečte.
-- V textech níž nesmí být středník: běhoun migrací dělí soubor podle něj.

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS pricing_rules jsonb;
-- Za který měsíc už proběhlo vyhodnocení nabídek (YYYY-MM), ať ho cron neudělá dvakrát.
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS offer_review_period text;

CREATE TABLE IF NOT EXISTS offer_proposals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  research_id         uuid        REFERENCES offer_research(id) ON DELETE SET NULL,
  -- Zakázka, která z nabídky vznikla. Dokud je, úklid po 12 měsících nabídku nechá.
  project_id          uuid        REFERENCES projects(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'negotiating', 'no_reply')),
  -- Verze cenových pravidel, podle které se ceny spočítaly.
  rules_version       integer     NOT NULL DEFAULT 1 CHECK (rules_version >= 1),
  -- Název firmy na stránce nabídky (snímek, ne živý údaj z kontaktu).
  company             text        NOT NULL CHECK (length(company) BETWEEN 1 AND 200),
  kind                text        NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'eshop')),
  -- Index pásma v pravidlech (0 = nejnižší), u e-shopu NULL.
  band                integer     CHECK (band IS NULL OR band BETWEEN 0 AND 20),
  -- Z čeho se ceny spočítaly: typická zakázka klienta, pozice v pásmu, příplatky.
  inputs              jsonb       NOT NULL,
  -- Odhad hodnoty pro klienta (poptávky měsíčně, podíl zakázek, roční hodnota, předpoklady, jistota).
  value               jsonb       NOT NULL,
  -- Tři varianty: klíč, název, co obsahuje, cena teď a cena podle pravidel.
  variants            jsonb       NOT NULL,
  recommended         text        NOT NULL DEFAULT 'doporucena' CHECK (recommended IN ('zaklad', 'doporucena', 'plus')),
  management_monthly  integer     NOT NULL DEFAULT 999 CHECK (management_monthly >= 0),
  deposit_percent     integer     NOT NULL DEFAULT 30 CHECK (deposit_percent BETWEEN 0 AND 100),
  -- Odstavec pro klienta. Píše ho model, před odesláním ho vidí a upraví Kryštof.
  intro               text        NOT NULL DEFAULT '' CHECK (length(intro) <= 2000),
  -- Jen pro Kryštofa: proč tahle pozice v pásmu, co o firmě rozhodlo. Na stránku nikdy.
  internal            jsonb,
  -- Obor pro vyhodnocení po oborech (N4).
  industry            text        CHECK (industry IS NULL OR length(industry) <= 80),
  -- Odkaz /nabidka/<token>. Stránka ukáže nabídku až po odeslání (status <> draft).
  public_token        uuid        NOT NULL DEFAULT gen_random_uuid(),
  -- Cena nad stropem (50 000 Kč) jde poslat jen s potvrzením Kryštofa.
  over_cap_confirmed  boolean     NOT NULL DEFAULT false,
  sent_at             timestamptz,
  -- Ceny variant v okamžiku odeslání. Z nich a z variants.proposed se měří odchylka.
  sent_variants       jsonb,
  valid_until         timestamptz,
  -- Otevření zapisuje až prohlížeč (ne náhled odkazu v poštovním filtru), jako u dotazníku R-119.
  opened_at           timestamptz,
  last_opened_at      timestamptz,
  open_count          integer     NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  chosen_variant      text        CHECK (chosen_variant IS NULL OR chosen_variant IN ('zaklad', 'doporucena', 'plus')),
  chosen_management   boolean,
  chosen_at           timestamptz,
  outcome_at          timestamptz,
  -- Kdo výsledek zapsal: klient na stránce, zakázka u kontaktu, 14 dní bez odpovědi, nebo Kryštof.
  outcome_source      text        CHECK (outcome_source IS NULL OR outcome_source IN ('client', 'project', 'timeout', 'manual')),
  final_price_czk     integer     CHECK (final_price_czk IS NULL OR final_price_czk >= 0),
  -- Cena snížená kvůli referenci: navrhovač se z ní neučí.
  reference_price     boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE offer_proposals IS
  'Návrh nabídky se třemi variantami a jeho výsledek (R-147, N2–N4). Bez zakázky 12 měsíců.';

CREATE UNIQUE INDEX IF NOT EXISTS offer_proposals_token_idx ON offer_proposals (public_token);
CREATE INDEX IF NOT EXISTS offer_proposals_contact_idx ON offer_proposals (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offer_proposals_sent_idx ON offer_proposals (sent_at DESC) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS offer_proposals_waiting_idx ON offer_proposals (sent_at) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS offer_proposals_project_idx ON offer_proposals (project_id) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS offer_rule_suggestions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Co přesně se navrhuje a k jaké verzi pravidel. Stejný návrh podruhé nevznikne.
  fingerprint    text        NOT NULL CHECK (fingerprint ~ '^[a-z0-9:_.-]{1,120}$'),
  kind           text        NOT NULL CHECK (kind IN ('raise_band', 'shift_variant', 'insight')),
  period         text        NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  payload        jsonb       NOT NULL,
  reason         text        NOT NULL CHECK (length(reason) BETWEEN 1 AND 600),
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  rules_version  integer     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_rule_suggestions_fingerprint_idx ON offer_rule_suggestions (fingerprint);
CREATE INDEX IF NOT EXISTS offer_rule_suggestions_pending_idx ON offer_rule_suggestions (created_at DESC) WHERE status = 'pending';

-- Zakázka u kontaktu s odeslanou nabídkou = přijal, s výslednou cenou zakázky (pravidla, oddíl 5).
-- Platí pro každou cestu, kudy zakázka vzniká (formulář, Hovory, asistent), proto trigger.
-- Kontakty se porovnávají podle kořene sloučení (R-095).
CREATE OR REPLACE FUNCTION offer_proposals_follow_project() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  root uuid;
BEGIN
  UPDATE offer_proposals
     SET final_price_czk = CASE WHEN NEW.price IS NULL THEN final_price_czk ELSE least(greatest(round(NEW.price), 0), 2000000000)::integer END,
         updated_at = now()
   WHERE project_id = NEW.id;
  IF FOUND OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(c.merged_into, c.id) INTO root FROM contacts c WHERE c.id = NEW.contact_id;
  IF root IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO target
    FROM offer_proposals p
    JOIN contacts c ON c.id = p.contact_id
   WHERE coalesce(c.merged_into, c.id) = root
     AND p.project_id IS NULL
     AND p.status <> 'draft'
     AND p.sent_at > now() - interval '120 days'
   ORDER BY p.sent_at DESC
   LIMIT 1;
  IF target IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE offer_proposals
     SET project_id = NEW.id,
         outcome_source = CASE WHEN status = 'accepted' THEN outcome_source ELSE 'project' END,
         outcome_at = CASE WHEN status = 'accepted' THEN outcome_at ELSE now() END,
         status = 'accepted',
         final_price_czk = CASE WHEN NEW.price IS NULL THEN NULL ELSE least(greatest(round(NEW.price), 0), 2000000000)::integer END,
         updated_at = now()
   WHERE id = target;

  UPDATE offer_research r
     SET project_id = NEW.id, updated_at = now()
    FROM offer_proposals p
   WHERE p.id = target AND r.id = p.research_id AND r.project_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_offer_proposals ON projects;
CREATE TRIGGER trg_projects_offer_proposals
  AFTER INSERT OR UPDATE OF contact_id, price ON projects
  FOR EACH ROW EXECUTE FUNCTION offer_proposals_follow_project();

CREATE OR REPLACE FUNCTION purge_offer_proposals() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM offer_proposals
   WHERE project_id IS NULL
     AND updated_at < now() - interval '12 months';
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM offer_rule_suggestions
   WHERE status <> 'pending'
     AND decided_at < now() - interval '24 months';
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION purge_offer_proposals() IS
  'Smaže nabídky bez zakázky 12 měsíců od poslední změny a vyřízené návrhy pravidel po 24 měsících (D-N5).';
