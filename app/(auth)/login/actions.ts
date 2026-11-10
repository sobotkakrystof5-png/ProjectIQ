'use server'

import { getAdminCandidate } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Po zadání hesla na /login: je to admin účet? Jiný účet (Workspace, klientský
 * prostor) se hned odhlásí, aby v adminu nezůstala cizí session. Admin pak
 * pokračuje na /login/overeni — kód z aplikace (2FA) je povinný (R-081).
 */
export async function confirmAdminSignIn(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await getAdminCandidate()) return { ok: true }
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  return { ok: false, error: 'Tenhle účet nemá přístup do administrace.' }
}
