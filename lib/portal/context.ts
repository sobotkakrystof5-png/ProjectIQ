import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { supabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { portalSystem } from './db'
import { PORTAL_NO_ACCESS_PATH, PORTAL_SIGN_IN_PATH } from './paths'

// Kdo je přihlášený klient (KP05, od R-107 přes Supabase Auth). Supabase řekne,
// kdo je člověk; které firmě patří, řekne tabulka portal.members (funkce
// member_lookup). Bez členství není přístup, i když je session platná — to platí
// i pro admina, který je ve stejném projektu Supabase. clientId se nikdy nebere
// z URL ani z formuláře.

export interface PortalContext {
  userId: string
  clientId: string
  memberId: string
  role: 'owner' | 'member'
  clientName: string
}

export type PortalIdentity = { userId: string; email: string | null }

/**
 * Přihlášený člověk podle podepsaného tokenu. `getClaims()` ověří podpis
 * (ES256) lokálně; `getSession()` by jen přečetl cookie a věřit se mu nesmí.
 */
export const getPortalIdentity = cache(async (): Promise<PortalIdentity | null> => {
  if (!supabaseConfigured()) return null
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = error ? null : data?.claims
  const userId = typeof claims?.sub === 'string' ? claims.sub : ''
  if (!userId) return null
  return { userId, email: typeof claims?.email === 'string' ? claims.email : null }
})

export const getPortalContext = cache(async (): Promise<PortalContext | null> => {
  const identity = await getPortalIdentity()
  if (!identity) return null
  const rows = await portalSystem<{ client_id: string; member_id: string; role: string; client_name: string }>`
    SELECT * FROM portal.member_lookup(${identity.userId})
  `
  const row = rows[0]
  if (!row) return null
  return {
    userId: identity.userId,
    clientId: row.client_id,
    memberId: row.member_id,
    role: row.role === 'owner' ? 'owner' : 'member',
    clientName: row.client_name,
  }
})

/** Přihlášený člen firmy, jinak přesměrování na přihlášení / „bez přístupu“. */
export async function requireClient(): Promise<PortalContext> {
  const identity = await getPortalIdentity()
  if (!identity) redirect(PORTAL_SIGN_IN_PATH)
  const ctx = await getPortalContext()
  if (!ctx) redirect(PORTAL_NO_ACCESS_PATH)
  return ctx
}
