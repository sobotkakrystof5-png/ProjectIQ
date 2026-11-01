-- Aktivita zakázky (KP03): časová osa „co se udělalo“ pro klienta.
-- Zpráva vzniká jako koncept (ručně, nebo z hlášení Claude Code — KP04), Kryštof
-- ji schválí a teprve potom ji klient vidí na /p/[token]. Koncepty, zdroj ani
-- příznak citlivosti se klientovi nikdy neukazují. Stávající progress_updates
-- zůstávají beze změny. Idempotentní.
CREATE TABLE IF NOT EXISTS project_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'manual',
  kind text NOT NULL DEFAULT 'done',
  title text NOT NULL,
  body text NOT NULL,
  -- Server v textu našel nebo zakryl něco, co vypadá jako tajný údaj; koncept
  -- jde schválit až po úpravě, která to odstraní.
  contains_sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  published_by text,
  -- Kdy odešel klientovi souhrnný e-mail s touto zprávou (max. 1× za den).
  client_emailed_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_status_check') THEN
    ALTER TABLE project_activity
      ADD CONSTRAINT project_activity_status_check CHECK (status IN ('draft', 'published', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_source_check') THEN
    ALTER TABLE project_activity
      ADD CONSTRAINT project_activity_source_check CHECK (source IN ('manual', 'claude_code', 'system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_kind_check') THEN
    ALTER TABLE project_activity
      ADD CONSTRAINT project_activity_kind_check CHECK (kind IN ('done', 'in_progress', 'question'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_title_len_check') THEN
    ALTER TABLE project_activity
      ADD CONSTRAINT project_activity_title_len_check CHECK (char_length(title) BETWEEN 1 AND 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_body_len_check') THEN
    ALTER TABLE project_activity
      ADD CONSTRAINT project_activity_body_len_check CHECK (char_length(body) BETWEEN 1 AND 4000);
  END IF;
  -- Zveřejněná zpráva musí mít datum zveřejnění a nesmí být označená jako citlivá.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_published_check') THEN
    ALTER TABLE project_activity
      ADD CONSTRAINT project_activity_published_check
      CHECK (status <> 'published' OR (published_at IS NOT NULL AND NOT contains_sensitive));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS project_activity_project_idx ON project_activity (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_activity_draft_idx ON project_activity (created_at DESC) WHERE status = 'draft';
