import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseUrl } from './config'

// Správa uživatelů Supabase Auth tajným klíčem (SUPABASE_SECRET_KEY, sb_secret_…):
// pozvánky vlastníků z adminu, výmaz účtu. Jen na serveru, nikdy do prohlížeče.
// Data aplikace přes tenhle klient nečteme — na to je přímé spojení (lib/pg.ts).

let client: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error('Chybí SUPABASE_SECRET_KEY (Supabase → Project Settings → API Keys → Secret keys).')
  client ??= createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}
