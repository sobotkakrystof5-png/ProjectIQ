import { createSql, ownerDatabaseUrl } from './pg'

// Admin konzole a veřejné endpointy adminu: role vlastníka tabulek z DATABASE_URL
// nebo POSTGRES_URL z integrace Supabase ↔ Vercel (Supavisor v režimu transaction). RLS pro ni neplatí, proto nikdy
// pro Workspace ani klientský prostor — ty mají vlastní role (lib/ws/db.ts,
// lib/portal/db.ts).
export const sql = createSql(
  ownerDatabaseUrl,
  'Chybí DATABASE_URL (nebo POSTGRES_URL z integrace Vercel) — connection string Supabase, Transaction pooler.',
)
