-- Migration 052: příjem AI-scorovaných leadů z externího vizeon-lead-agent
-- (Python/FastAPI). `client_*` sloupce jsou tvrzení od člověka z formuláře,
-- zbylé sloupce je odhad agenta (LLM scoring) — nikdy nemíchat do jedné
-- struktury, ať je vždy poznat, co je fakt a co odhad.
--
-- `lead_id` je unikátní klíč jednoho leadu z pohledu agenta — unikátní index
-- zajišťuje idempotenci (opakované doručení stejného lead_id přepíše záznam
-- přes ON CONFLICT, nevytvoří duplicitu).

CREATE TABLE IF NOT EXISTS agent_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id text NOT NULL,
  source text NOT NULL,
  payload_version integer NOT NULL,
  business text NOT NULL DEFAULT 'vizeon',
  received_at timestamptz NOT NULL,

  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  client_company text,
  client_service text NOT NULL,
  client_budget text,
  client_deadline text,
  client_message text,

  lead_score integer NOT NULL CHECK (lead_score >= 0 AND lead_score <= 100),
  priority text NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  score_breakdown jsonb NOT NULL,
  company_type text NOT NULL,
  industry text NOT NULL,
  digital_maturity text NOT NULL,
  project_complexity text NOT NULL,
  clarity_of_request text NOT NULL,
  summary text NOT NULL,
  communication_strategy jsonb NOT NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_leads_lead_id_key
  ON agent_leads(lead_id);
