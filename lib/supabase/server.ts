import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { supabasePublishableKey, supabaseUrl } from './config'
import { hardenedCookieOptions } from './cookies'

/**
 * Supabase klient pro server components, server actions a route handlery.
 * Na každý požadavek nový (Fluid compute nesmí klienta sdílet mezi požadavky).
 *
 * Zápis cookies ze server component Next zakazuje — proto `try/catch`. Session
 * obnovuje `proxy.ts`, takže se tím nic neztrácí.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const store = await cookies()

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet: { name: string; value: string; options?: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, hardenedCookieOptions(options))
          }
        } catch {
          // Server component cookies zapisovat nesmí — obnovení dělá proxy.
        }
      },
    },
  })
}
