-- Požadavky klientů z portálu /p/[token]: klient napíše nebo nadiktuje, co chce
-- změnit; systém z toho udělá shrnutí a návrh zadání pro Claude Code. Zadání
-- nikdy nespouští nic samo — Kryštof ho v adminu zkontroluje a vloží ručně.
-- Audio se neukládá, `raw_text` je text zadaný klientem (nebo jeho přepis).
CREATE TABLE IF NOT EXISTS client_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'text',
  raw_text text NOT NULL,
  -- Stav práce admina s požadavkem.
  status text NOT NULL DEFAULT 'new',
  -- Stav shrnutí od AI; selhání AI požadavek nikdy neblokuje.
  ai_status text NOT NULL DEFAULT 'pending',
  ai_kind text,
  ai_summary text,
  ai_prompt text,
  ai_unclear text,
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_requests_source_check') THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT client_requests_source_check CHECK (source IN ('text', 'voice'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_requests_status_check') THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT client_requests_status_check CHECK (status IN ('new', 'done', 'dismissed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_requests_ai_status_check') THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT client_requests_ai_status_check CHECK (ai_status IN ('pending', 'ready', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_requests_raw_text_len_check') THEN
    ALTER TABLE client_requests
      ADD CONSTRAINT client_requests_raw_text_len_check CHECK (char_length(raw_text) BETWEEN 1 AND 4000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_requests_project_idx ON client_requests (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_requests_open_idx ON client_requests (created_at DESC) WHERE status = 'new';
