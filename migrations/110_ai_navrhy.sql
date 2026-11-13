-- Migrace 110 (AD14): návrhy akcí od asistenta
--
-- Idempotentní a čistě aditivní: nic stávajícího se nemění, takže se smí
-- pustit i před nasazením větve. Bez ní asistent jen neuloží návrh a
-- potvrzení jedním klikem se nenabídne (`lib/admin/suggestions.ts` to pozná
-- a řekne to česky) — zbytek adminu běží dál.
--
-- ── Proč návrh patří do databáze, a ne do stavu prohlížeče ──────────────
--
-- Kdyby návrh žil jen v prohlížeči, musel by ho při potvrzení poslat zpátky
-- na server — a pak by to nebyl návrh od modelu, ale cokoli, co kdo pošle
-- do server action. Uložený řádek se při potvrzení **znovu parsuje** týmž
-- schématem (`lib/ai/suggestion-schema.ts`) a prohlížeč s ním mezitím nemá
-- jak hýbat: posílá jen `id`.
--
-- Vedlejší užitek: je vidět, co model navrhoval a co z toho člověk pustil
-- dál — podklad pro ladění promptů, a zároveň audit.

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Je to jeden admin (R-001), ale e-mail se hodí při pohledu do historie.
  author_email  text,
  -- Odkud přišla věta: 'command' (⌘K) nebo 'panel' (pravý panel).
  source        text NOT NULL DEFAULT 'panel',
  -- Věta od člověka, **už protažená `redactSensitive()`** — do databáze se
  -- nesmí dostat klíč ani connection string vložený omylem do okénka.
  input_text    text NOT NULL,
  model         text NOT NULL,
  -- Celá odpověď modelu ve tvaru `suggestionSchema`.
  proposal      jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'applied', 'rejected', 'expired')),
  applied_at    timestamptz,
  -- Co z návrhu vzniklo: { kind, id, href } — odkaz na výsledek.
  applied_ref   jsonb,
  tokens_in     integer,
  tokens_out    integer
);

-- Panel ukazuje posledních pár návrhů; expirace hledá staré `pending`.
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status_created
  ON ai_suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created
  ON ai_suggestions (created_at DESC);

-- ── Expirace ────────────────────────────────────────────────────────────
--
-- Nepotvrzený návrh po sedmi dnech propadá: kontext, ze kterého vznikl, už
-- neplatí a kliknutím by vznikl termín na dávno minulé datum. Volá to denní
-- cron `send-reminders` — nový cron se kvůli jednomu UPDATE nezakládá
-- (Vercel Hobby, R-006) a stejně to v AD13 vyřešily opakované náklady.
CREATE OR REPLACE FUNCTION expire_ai_suggestions() RETURNS integer AS $$
DECLARE
  changed integer;
BEGIN
  UPDATE ai_suggestions
  SET status = 'expired'
  WHERE status = 'pending' AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$ LANGUAGE plpgsql;
