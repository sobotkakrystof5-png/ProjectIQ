// Adresa a veřejný klíč Supabase projektu (R-080). Obojí je veřejné — jde do
// prohlížeče (přihlašovací formuláře). Tajný klíč je jen v lib/supabase/admin.ts.
//
// `process.env.NEXT_PUBLIC_…` musí zůstat zapsané celé, jinak je Next do
// klientského balíčku nedosadí.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('Chybí NEXT_PUBLIC_SUPABASE_URL (Supabase → Project Settings → API).')
  return url
}

export function supabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key) throw new Error('Chybí NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Supabase → Project Settings → API Keys).')
  return key
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
