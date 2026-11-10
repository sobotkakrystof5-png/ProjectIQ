import { createBrowserClient } from '@supabase/ssr'

// Supabase v prohlížeči — jen přihlašovací formuláře (heslo, Google, obnova
// hesla). Session uloží do cookies, server ji pak přečte (lib/supabase/server.ts).
// Žádná data aplikace se z prohlížeče do Supabase nečtou (Data API je zavřené,
// migrace 102).

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  )
}
