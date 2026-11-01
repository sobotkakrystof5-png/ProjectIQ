-- Klíče projektů pro hlášení z Claude Code (KP04). Klíč umí jen zapsat koncept
-- hlášení do jednoho projektu (tabulka project_activity, status = 'draft'),
-- nic nečte, nic nemění a nic nepublikuje. V databázi je jen prefix pro
-- vyhledání a HMAC-SHA256 celého klíče s pepřem AGENT_KEY_PEPPER; klíč samotný
-- se ukáže jednou při vytvoření. Otočení = starý klíč se zneplatní (řádek
-- zůstane jako záznam, kdo a kdy), vznikne nový. Idempotentní.
CREATE TABLE IF NOT EXISTS project_agent_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_agent_keys_prefix_key') THEN
    ALTER TABLE project_agent_keys ADD CONSTRAINT project_agent_keys_prefix_key UNIQUE (prefix);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_agent_keys_prefix_check') THEN
    ALTER TABLE project_agent_keys
      ADD CONSTRAINT project_agent_keys_prefix_check CHECK (prefix ~ '^[A-Za-z0-9]{10}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_agent_keys_hash_check') THEN
    ALTER TABLE project_agent_keys
      ADD CONSTRAINT project_agent_keys_hash_check CHECK (key_hash ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

-- Nejvýš jeden platný klíč na projekt.
CREATE UNIQUE INDEX IF NOT EXISTS project_agent_keys_active_idx
  ON project_agent_keys (project_id) WHERE revoked_at IS NULL;
