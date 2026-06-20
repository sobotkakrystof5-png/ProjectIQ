CREATE TABLE IF NOT EXISTS client_leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  lead_status text DEFAULT 'cold',
  next_action text,
  next_action_date date,
  notes text,
  estimated_value numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
