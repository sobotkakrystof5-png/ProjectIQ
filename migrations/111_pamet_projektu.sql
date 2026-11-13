-- Migrace 111 (AD15): paměť projektu + retence návrhů asistenta
--
-- Aditivní a idempotentní: nic stávajícího se nemění, takže se smí pustit
-- i před nasazením větve. Bez ní se paměť jen neukáže a neuloží
-- (`lib/admin/memory/store.ts` to pozná podle `42P01` a řekne to česky) —
-- předvyplnění formulářů z historie běží dál, protože je čistě z SQL nad
-- tabulkami, které tu jsou dávno.
--
-- ── Proč to není jedna tabulka s „fakty" ───────────────────────────────
--
-- Vrstvy jsou dvě a schválně se nemíchají (R-085):
--   1. **Fakta** se počítají dotazem nad historií (`lib/admin/memory/facts.ts`).
--      Nikdy se neukládají jako text, takže nemůžou zestárnout ani lhát —
--      a **jen ony plní formuláře**.
--   2. **Paměť** (tahle tabulka) je věta, kterou napsal člověk nebo model.
--      Může být nepřesná, proto má zdroj, platnost a příznak potvrzení.
--      Do předvyplněného pole se nikdy nedostane.
--
-- ── Proč `ref_id` nemá cizí klíč ───────────────────────────────────────
--
-- Je polymorfní: podle `scope` ukazuje do `projects`, do `contacts`, nebo
-- nikam (globální paměť). FK to neumí, takže úklid po smazání zakázky nebo
-- kontaktu dělají triggery níž — a navíc ho pro jistotu opakuje denní úklid.

CREATE TABLE IF NOT EXISTS project_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Čeho se paměť týká. 'global' = platí pro celé podnikání.
  scope         text NOT NULL CHECK (scope IN ('project', 'contact', 'global')),
  ref_id        uuid,
  -- 'summary' shrnutí · 'preference' jak to klient chce · 'risk' na co si dát
  -- pozor · 'glossary' co u něj znamená které slovo.
  kind          text NOT NULL CHECK (kind IN ('summary', 'preference', 'risk', 'glossary')),
  -- Text **už protažený `redactSensitive()`**; text se značkou `[skryto]`
  -- se odmítá uložit úplně (`lib/admin/memory/store.ts`).
  text          text NOT NULL,
  -- Odkud věta přišla: 'manual' (člověk napsal), 'activity' (cron ze zpráv
  -- o práci), 'assistant' (z rozhovoru s asistentem).
  source        text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'activity', 'assistant')),
  -- Který model to napsal. U ruční poznámky NULL.
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Dokud tohle datum platí, paměť se používá. Potvrzená má tři roky od
  -- posledního pohybu (R-076), nepotvrzený návrh 90 dnů od vzniku.
  valid_until   timestamptz NOT NULL,
  -- NULL = nepotvrzeno. V UI „Návrh paměti"; používá se, ale je označené.
  confirmed_by  text,
  confirmed_at  timestamptz,
  CONSTRAINT project_memory_scope_ref CHECK ((scope = 'global') = (ref_id IS NULL)),
  CONSTRAINT project_memory_confirmed CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);

-- Čtení je vždycky „co víme o tomhle": scope + ref, nejnovější nahoře.
CREATE INDEX IF NOT EXISTS idx_project_memory_scope_ref
  ON project_memory (scope, ref_id, created_at DESC);

-- Denní úklid hledá prošlé.
CREATE INDEX IF NOT EXISTS idx_project_memory_valid
  ON project_memory (valid_until);

-- Panel „Návrhy paměti" hledá nepotvrzené.
CREATE INDEX IF NOT EXISTS idx_project_memory_unconfirmed
  ON project_memory (created_at DESC) WHERE confirmed_by IS NULL;

-- ── Úklid po smazání zakázky nebo kontaktu ─────────────────────────────
--
-- Polymorfní `ref_id` nejde přes FK, takže smazání musí paměť vzít s sebou
-- samo. Trigger je tu proto, že cesta ke smazání je víc než jedna (akce
-- v adminu, ruční SQL při žádosti GDPR) a žádná z nich si nesmí pamatovat,
-- že má uklidit i tady.

CREATE OR REPLACE FUNCTION public.project_memory_forget() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM project_memory WHERE scope = TG_ARGV[0] AND ref_id = OLD.id;
  RETURN OLD;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_projects_forget_memory ON projects;
    CREATE TRIGGER trg_projects_forget_memory
      AFTER DELETE ON projects
      FOR EACH ROW EXECUTE FUNCTION public.project_memory_forget('project');
  END IF;
  IF to_regclass('public.contacts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_contacts_forget_memory ON contacts;
    CREATE TRIGGER trg_contacts_forget_memory
      AFTER DELETE ON contacts
      FOR EACH ROW EXECUTE FUNCTION public.project_memory_forget('contact');
  END IF;
END
$$;

-- ── Denní úklid ───────────────────────────────────────────────────
--
-- Tři věci v jedné funkci, protože všechny patří k téže otázce „co už si
-- nemáme pamatovat":
--
--   1. **Prodloužení platnosti.** R-076 říká „tři roky od posledního pohybu",
--      ne od zápisu. Zakázka, ke které se člověk po dvou letech vrátí, tedy
--      paměť neztratí. Počítá se stejně jako v migraci 098: změna zakázky,
--      zpráva o práci, požadavek klienta; u kontaktu `last_seen_at`.
--   2. **Smazání prošlého.** Nepotvrzený návrh po 90 dnech, potvrzená paměť
--      tři roky po posledním pohybu, a osiřelé řádky (kdyby trigger někdo
--      obešel).
--   3. **Retence návrhů asistenta** (`ai_suggestions` z migrace 110).
--      `input_text` je sice po `redactSensitive()`, ale může nést jméno nebo
--      telefon klienta — a jako podklad pro ladění promptů stačí pár měsíců.
--
-- Dotazy se skládají přes `EXECUTE`, protože každá z dotčených tabulek
-- (`projects`, `contacts`, `project_activity`, `client_requests`,
-- `ai_suggestions`) přišla jinou migrací a na čerstvé databázi nemusí být.
-- Obalit je podmínkou `IF … THEN` nestačí: plpgsql si statický dotaz přeloží
-- při prvním průchodu a chybějící tabulka ho shodí, i když se větev nikdy
-- neprovede.
--
-- Spouští denní cron /api/cron/client-retention rolí vlastníka tabulek.
-- Idempotentní: opakovaný běh nic dalšího nesmaže.

CREATE OR REPLACE FUNCTION public.purge_memory_retention(
  p_years integer DEFAULT 3,
  p_suggestion_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_extended    integer := 0;
  v_rows        integer := 0;
  v_expired     integer := 0;
  v_orphans     integer := 0;
  v_suggestions integer := 0;
  v_move        text;
BEGIN
  IF p_years IS NULL OR p_years < 1 THEN
    RAISE EXCEPTION 'retence musí být aspoň 1 rok';
  END IF;

  -- 1. Platnost potvrzené paměti podle posledního pohybu.
  IF to_regclass('public.projects') IS NOT NULL THEN
    v_move := 'COALESCE(p.updated_at, p.created_at)';
    IF to_regclass('public.project_activity') IS NOT NULL THEN
      v_move := 'GREATEST(' || v_move || ', COALESCE((SELECT max(GREATEST(a.created_at, a.updated_at))'
             || ' FROM project_activity a WHERE a.project_id = p.id), p.created_at))';
    END IF;
    IF to_regclass('public.client_requests') IS NOT NULL THEN
      v_move := 'GREATEST(' || v_move || ', COALESCE((SELECT max(r.created_at)'
             || ' FROM client_requests r WHERE r.project_id = p.id), p.created_at))';
    END IF;

    EXECUTE format($q$
      UPDATE project_memory m
      SET valid_until = pohyb.at + make_interval(years => $1::int)
      FROM (SELECT p.id, %s AS at FROM projects p) pohyb
      WHERE m.scope = 'project' AND m.ref_id = pohyb.id AND m.confirmed_by IS NOT NULL
        AND m.valid_until IS DISTINCT FROM pohyb.at + make_interval(years => $1::int)
    $q$, v_move) USING p_years;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_extended := v_extended + v_rows;
  END IF;

  IF to_regclass('public.contacts') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE project_memory m
      SET valid_until = COALESCE(c.last_seen_at, c.created_at) + make_interval(years => $1::int)
      FROM contacts c
      WHERE m.scope = 'contact' AND m.ref_id = c.id AND m.confirmed_by IS NOT NULL
        AND m.valid_until IS DISTINCT FROM
            COALESCE(c.last_seen_at, c.created_at) + make_interval(years => $1::int)
    $q$ USING p_years;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_extended := v_extended + v_rows;
  END IF;

  -- 2. Prošlé a osiřelé.
  DELETE FROM project_memory WHERE valid_until < now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  IF to_regclass('public.projects') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM project_memory m
      WHERE m.scope = 'project' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = m.ref_id)
    $q$;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_orphans := v_orphans + v_rows;
  END IF;

  IF to_regclass('public.contacts') IS NOT NULL THEN
    EXECUTE $q$
      DELETE FROM project_memory m
      WHERE m.scope = 'contact' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = m.ref_id)
    $q$;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_orphans := v_orphans + v_rows;
  END IF;

  -- 3. Návrhy asistenta (AD14).
  IF to_regclass('public.ai_suggestions') IS NOT NULL AND p_suggestion_days >= 1 THEN
    EXECUTE 'DELETE FROM ai_suggestions WHERE created_at < now() - make_interval(days => $1::int)'
      USING p_suggestion_days;
    GET DIAGNOSTICS v_suggestions = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'memory_extended', v_extended,
    'memory_expired', v_expired,
    'memory_orphans', v_orphans,
    'suggestions', v_suggestions
  );
END
$$;

REVOKE ALL ON FUNCTION public.purge_memory_retention(integer, integer) FROM PUBLIC;
