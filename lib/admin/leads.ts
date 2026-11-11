import 'server-only'
import { adminDb, type AdminQuery } from './db'
import type { TableParams } from '@/lib/admin-table'
import type { ClientLead, LeadNote } from '@/lib/types'

/**
 * Hovory `/dashboard/calls` (AD07).
 *
 * Dvě věci se tu spravily: obrazovka si brala **všechny** kontakty a k nim
 * **všechny poznámky všech kontaktů** (`getAllLeadNotes`) a párovala je
 * v prohlížeči. Teď chodí jedna stránka kontaktů a u každého jen náhled
 * posledních tří poznámek z `LEFT JOIN LATERAL`; celé poznámky se dotáhnou
 * až po rozbalení řádku.
 */

export const LEAD_SORT = {
  firma: { sql: 'l.company_name', dir: 'asc' as const },
  kontakt: { sql: 'l.contact_name', dir: 'asc' as const },
  zajem: { sql: 'l.lead_status', dir: 'asc' as const },
  akce: { sql: 'l.next_action_date', dir: 'asc' as const },
  hodnota: { sql: 'l.estimated_value', dir: 'desc' as const },
  pridano: { sql: 'l.created_at', dir: 'desc' as const },
}

/** Kolik poznámek se ukáže v řádku, než se kontakt rozbalí. */
const NOTE_PREVIEW = 3
/** Strop poznámek jednoho kontaktu v rozbaleném panelu. */
const NOTES_LIMIT = 200

export type LeadRow = ClientLead & {
  /** Poslední poznámky (náhled); celé se načtou po rozbalení. */
  note_preview: LeadNote[]
  notes_count: number
}

export type CallsScreen = {
  rows: LeadRow[]
  /** Kolik kontaktů je v zobrazeném pohledu. */
  total: number
  active: number
  waiting: number
  /** Kontakty s příští akcí v minulosti — ty volají po pozornosti. */
  overdue: number
}

const COLUMNS = `l.*, l.next_action_date::text AS next_action_date,
  coalesce(n.preview, '[]'::json) AS note_preview,
  coalesce(nc.pocet, 0) AS notes_count`

const NOTE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT json_agg(x) AS preview
    FROM (
      SELECT ln.id::text, ln.lead_id::text, ln.content, ln.created_at
      FROM lead_notes ln
      WHERE ln.lead_id = l.id
      ORDER BY ln.created_at DESC
      LIMIT ${NOTE_PREVIEW}
    ) x
  ) n ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS pocet FROM lead_notes ln WHERE ln.lead_id = l.id
  ) nc ON true
`

export async function loadCallsScreen(params: TableParams, waiting: boolean): Promise<CallsScreen> {
  const page: AdminQuery = {
    text: `SELECT ${COLUMNS}
           FROM client_leads l
           ${NOTE_JOIN}
           WHERE l.lead_status ${waiting ? '=' : '<>'} 'waiting'
           ${params.orderBy}
           LIMIT $1 OFFSET $2`,
    params: [params.limit, params.offset],
  }

  const counts: AdminQuery = {
    text: `SELECT
             count(*) FILTER (WHERE lead_status <> 'waiting')::int AS aktivni,
             count(*) FILTER (WHERE lead_status = 'waiting')::int AS cekajici,
             count(*) FILTER (WHERE lead_status <> 'waiting' AND next_action_date < current_date)::int AS po_terminu
           FROM client_leads`,
    params: [],
  }

  const [pageRows, countRows] = await adminDb.batch([page, counts])
  const c = countRows[0] ?? {}
  const active = Number(c.aktivni ?? 0)
  const waitingCount = Number(c.cekajici ?? 0)

  return {
    rows: pageRows as unknown as LeadRow[],
    total: waiting ? waitingCount : active,
    active,
    waiting: waitingCount,
    overdue: Number(c.po_terminu ?? 0),
  }
}

/** Všechny poznámky jednoho kontaktu — až když si je někdo rozklikne. */
export async function loadLeadNotes(leadId: string): Promise<LeadNote[]> {
  const [rows] = await adminDb.batch([
    {
      text: `SELECT id::text, lead_id::text, content, created_at
             FROM lead_notes WHERE lead_id = $1
             ORDER BY created_at DESC LIMIT $2`,
      params: [leadId, NOTES_LIMIT],
    },
  ])
  return rows as unknown as LeadNote[]
}
