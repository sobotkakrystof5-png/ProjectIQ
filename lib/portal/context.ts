import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { portalSystem } from './db'
import { PORTAL_NO_ACCESS_PATH, PORTAL_SIGN_IN_PATH } from './paths'

// Kdo je přihlášený klient (KP05). Clerk řekne, kdo je člověk; které firmě patří,
// řekne tabulka portal.members (funkce member_lookup). Bez členství není přístup,
// i když je Clerk přihlášený. clientId se nikdy nebere z URL ani z formuláře.

export interface PortalContext {
  userId: string
  clientId: string
  memberId: string
  role: 'owner' | 'member'
  clientName: string
}

export const getPortalContext = cache(async (): Promise<PortalContext | null> => {
  const { userId } = await auth()
  if (!userId) return null
  const rows = await portalSystem<{ client_id: string; member_id: string; role: string; client_name: string }>`
    SELECT * FROM portal.member_lookup(${userId})
  `
  const row = rows[0]
  if (!row) return null
  return {
    userId,
    clientId: row.client_id,
    memberId: row.member_id,
    role: row.role === 'owner' ? 'owner' : 'member',
    clientName: row.client_name,
  }
})

/** Přihlášený člen firmy, jinak přesměrování na přihlášení / „bez přístupu“. */
export async function requireClient(): Promise<PortalContext> {
  const { userId } = await auth()
  if (!userId) redirect(PORTAL_SIGN_IN_PATH)
  const ctx = await getPortalContext()
  if (!ctx) redirect(PORTAL_NO_ACCESS_PATH)
  return ctx
}
