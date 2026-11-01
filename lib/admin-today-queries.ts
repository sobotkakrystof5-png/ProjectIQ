import { sql } from '@/lib/db'
import { projectPath, toBusiness } from '@/lib/business'
import { STALE_AFTER_DAYS, type TodayData } from '@/lib/admin-today'

const iso = (value: Date | string): string => new Date(value).toISOString()

/** Dotaz na tabulku, která vzniká pozdější migrací: bez ní vrátí prázdný seznam. */
const optional = <T,>(query: PromiseLike<T[]>): Promise<T[]> => Promise.resolve(query).catch(() => [])

/** Data pro Dnes: každá sekce se načítá samostatně a jedna chyba nesmí shodit celou stránku. */
export async function loadTodayData(): Promise<TodayData> {
  const [requests, drafts, invoices, slots, calls, stale] = await Promise.all([
    optional(sql`
      SELECT r.id, r.ai_summary, r.created_at, p.id AS project_id, p.client_name, p.business
      FROM client_requests r JOIN projects p ON p.id = r.project_id
      WHERE r.status = 'new'
      ORDER BY r.created_at ASC LIMIT 20
    `),
    optional(sql`
      SELECT p.id AS project_id, p.client_name, p.business,
             count(*)::int AS count, count(*) FILTER (WHERE a.contains_sensitive)::int AS sensitive
      FROM project_activity a JOIN projects p ON p.id = a.project_id
      WHERE a.status = 'draft'
      GROUP BY p.id, p.client_name, p.business
      ORDER BY min(a.created_at) ASC LIMIT 20
    `),
    optional(sql`
      SELECT id, invoice_number, client_name, due_on, amount, currency
      FROM invoices
      WHERE paid_on IS NULL AND due_on IS NOT NULL AND due_on < CURRENT_DATE
      ORDER BY due_on ASC LIMIT 10
    `),
    optional(sql`
      SELECT cs.id, cs.scheduled_at AS at, p.client_name, p.id AS project_id, p.business
      FROM consultation_slots cs JOIN projects p ON p.id = cs.project_id
      WHERE cs.scheduled_at > now()
      ORDER BY cs.scheduled_at LIMIT 5
    `),
    optional(sql`
      SELECT id, company_name, next_action, next_action_date, next_action_time
      FROM client_leads
      WHERE next_action_date IS NOT NULL AND next_action_date >= CURRENT_DATE
        AND lead_status NOT IN ('converted', 'lost')
      ORDER BY next_action_date, next_action_time NULLS LAST LIMIT 5
    `),
    optional(sql`
      SELECT id, client_name, business, updated_at
      FROM projects
      WHERE status IN ('new', 'in_progress', 'review')
        AND updated_at < now() - interval '1 day' * ${STALE_AFTER_DAYS}
        AND NOT (business = 'vizeon' AND is_vizeon_pending(source, vizeon_confirmed))
        AND NOT (business = 'alteno' AND is_alteno_pending(source, alteno_confirmed))
      ORDER BY updated_at ASC LIMIT 5
    `),
  ])

  return {
    requests: (requests as { id: string; ai_summary: string | null; created_at: string; client_name: string }[]).map((r) => ({
      id: r.id,
      clientName: r.client_name,
      summary: r.ai_summary,
      createdAt: iso(r.created_at),
      href: '/dashboard/pozadavky',
    })),
    drafts: (drafts as { project_id: string; client_name: string; business: string; count: number; sensitive: number }[]).map((d) => ({
      projectId: d.project_id,
      clientName: d.client_name,
      count: d.count,
      sensitive: d.sensitive,
      href: `${projectPath(toBusiness(d.business), d.project_id)}?zalozka=aktivita`,
    })),
    overdueInvoices: (invoices as { id: string; invoice_number: string; client_name: string | null; due_on: string; amount: number; currency: string }[]).map((i) => ({
      id: i.id,
      number: i.invoice_number,
      clientName: i.client_name,
      dueOn: iso(i.due_on),
      amount: Number(i.amount),
      currency: i.currency,
    })),
    upcoming: [
      ...(slots as { id: string; at: string; client_name: string; project_id: string; business: string }[]).map((s) => ({
        id: `slot-${s.id}`,
        at: iso(s.at),
        label: `Konzultace: ${s.client_name}`,
        detail: null,
        href: projectPath(toBusiness(s.business), s.project_id),
      })),
      ...(calls as { id: string; company_name: string; next_action: string | null; next_action_date: string; next_action_time: string | null }[]).map((c) => ({
        id: `call-${c.id}`,
        at: iso(`${String(c.next_action_date).slice(0, 10)}T${(c.next_action_time ?? '09:00').slice(0, 5)}:00`),
        label: c.company_name,
        detail: c.next_action,
        href: '/dashboard/calls',
      })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    stale: (stale as { id: string; client_name: string; business: string; updated_at: string }[]).map((s) => ({
      id: s.id,
      clientName: s.client_name,
      updatedAt: iso(s.updated_at),
      href: projectPath(toBusiness(s.business), s.id),
    })),
  }
}
