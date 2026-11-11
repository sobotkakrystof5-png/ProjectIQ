'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { projectPath } from '@/lib/lead-origins'
import { SEARCH_LIMIT_PER_KIND, toLikePattern, type SearchHit } from '@/lib/admin-search'

// Hledání v administraci (⌘K). Vrací jen název a odkaz, žádné poznámky ani ceny.

export async function searchAdmin(query: string): Promise<SearchHit[]> {
  await requireAuth()
  const pattern = typeof query === 'string' ? toLikePattern(query) : null
  if (!pattern) return []

  const [projects, leads, invoices] = await Promise.all([
    sql`
      SELECT id, client_name, description FROM projects
      WHERE client_name ILIKE ${pattern} OR coalesce(description, '') ILIKE ${pattern}
      ORDER BY updated_at DESC LIMIT ${SEARCH_LIMIT_PER_KIND}
    `,
    sql`
      SELECT id, company_name, contact_name FROM client_leads
      WHERE company_name ILIKE ${pattern} OR coalesce(contact_name, '') ILIKE ${pattern}
      ORDER BY created_at DESC LIMIT ${SEARCH_LIMIT_PER_KIND}
    `,
    sql`
      SELECT id, invoice_number, client_name FROM invoices
      WHERE invoice_number ILIKE ${pattern} OR coalesce(client_name, '') ILIKE ${pattern}
      ORDER BY issued_on DESC LIMIT ${SEARCH_LIMIT_PER_KIND}
    `,
  ])

  const hits: SearchHit[] = []
  for (const r of projects as { id: string; client_name: string; description: string | null }[]) {
    hits.push({
      kind: 'project',
      id: r.id,
      title: r.client_name,
      subtitle: r.description ?? undefined,
      href: projectPath(r.id),
    })
  }
  for (const r of leads as { id: string; company_name: string; contact_name: string | null }[]) {
    hits.push({ kind: 'lead', id: r.id, title: r.company_name, subtitle: r.contact_name ?? undefined, href: '/dashboard/calls' })
  }
  for (const r of invoices as { id: string; invoice_number: string; client_name: string | null }[]) {
    hits.push({ kind: 'invoice', id: r.id, title: r.invoice_number, subtitle: r.client_name ?? undefined, href: '/dashboard/faktury' })
  }
  return hits
}
