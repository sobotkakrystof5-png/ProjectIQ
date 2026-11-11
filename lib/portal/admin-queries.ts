import { sql } from '@/lib/db'

// Čtení pro admina nad schématem portal (vlastník tabulek). Do nasazení
// migrace 095 vracejí `ready: false`, aby stránky nespadly.

export interface PortalClientRow {
  id: string
  name: string
  created_at: string
  members: number
  projects: number
}

export async function listPortalClients(): Promise<{ ready: boolean; clients: PortalClientRow[] }> {
  try {
    const rows = await sql`
      SELECT c.id, c.name, c.created_at,
        (SELECT count(*)::int FROM portal.members m WHERE m.client_id = c.id AND m.removed_at IS NULL) AS members,
        (SELECT count(*)::int FROM portal.projects p WHERE p.client_id = c.id) AS projects
      FROM portal.clients c WHERE c.archived_at IS NULL
      ORDER BY c.created_at DESC
    `
    return { ready: true, clients: rows as PortalClientRow[] }
  } catch {
    return { ready: false, clients: [] }
  }
}

export interface PortalClientDetail {
  client: { id: string; name: string }
  members: { id: string; name: string | null; email: string | null; role: string; created_at: string }[]
  invites: { id: string; email: string | null; role: string; created_at: string; expires_at: string; state: 'open' | 'used' | 'revoked' | 'expired' }[]
  projects: { id: string; name: string; status: string }[]
  unlinked: { id: string; client_name: string; lead_origin: string }[]
}

export async function loadPortalClient(id: string): Promise<PortalClientDetail | null> {
  const clients = await sql`SELECT id, name FROM portal.clients WHERE id = ${id} AND archived_at IS NULL`
  const client = clients[0] as { id: string; name: string } | undefined
  if (!client) return null
  const [members, invites, projects, unlinked] = await Promise.all([
    sql`SELECT id, name, email, role, created_at FROM portal.members WHERE client_id = ${id} AND removed_at IS NULL ORDER BY created_at`,
    sql`
      SELECT id, email, role, created_at, expires_at,
        CASE WHEN used_at IS NOT NULL THEN 'used' WHEN revoked_at IS NOT NULL THEN 'revoked'
             WHEN expires_at <= now() THEN 'expired' ELSE 'open' END AS state
      FROM portal.invites WHERE client_id = ${id} ORDER BY created_at DESC LIMIT 20
    `,
    sql`SELECT id, name, status FROM portal.projects WHERE client_id = ${id} ORDER BY name`,
    sql`
      SELECT p.id, p.client_name, p.lead_origin FROM public.projects p
      WHERE NOT EXISTS (SELECT 1 FROM portal.projects x WHERE x.id = p.id)
      ORDER BY p.client_name LIMIT 200
    `,
  ])
  return {
    client,
    members: members as PortalClientDetail['members'],
    invites: invites as PortalClientDetail['invites'],
    projects: projects as PortalClientDetail['projects'],
    unlinked: unlinked as PortalClientDetail['unlinked'],
  }
}
