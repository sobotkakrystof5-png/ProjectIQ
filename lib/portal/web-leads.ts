import 'server-only'
import { portalDb, pq, type PortalRow } from './db'
import { buildWebLeadStats, type WebLeadStats } from '@/lib/client-web/stats'

// Poptávky z webu klienta v klientském prostoru (KP17, R-129, migrace 126).
// Úzká funkce portal.web_lead_months vrátí členovi měsíční součty jeho
// zakázek s napojeným webem — jen čísla, žádné osobní údaje. Zakázka bez
// napojení v ní není, takže sekci nemá. Bez migrace se nic neukáže.

export const WEB_LEADS_SQL = (memberId: string) =>
  pq`SELECT project_id::text, to_char(month, 'YYYY-MM') AS month, poptavky, objednavky FROM portal.web_lead_months(${memberId})`

/** Řádky funkce → čísla podle zakázky. */
export function webLeadsByProject(rows: PortalRow[] | null): Map<string, WebLeadStats> {
  const grouped = new Map<string, PortalRow[]>()
  for (const r of rows ?? []) {
    const id = String(r.project_id)
    const list = grouped.get(id) ?? []
    list.push(r)
    grouped.set(id, list)
  }
  const out = new Map<string, WebLeadStats>()
  for (const [id, list] of grouped) {
    out.set(id, buildWebLeadStats(list as { month: unknown; poptavky: unknown; objednavky: unknown }[]))
  }
  return out
}

const TOLERATED = new Set(['42P01', '42883', '42501', '42703'])

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

/** Čísla jedné zakázky pro panel a detail. `null` = zakázka web napojený nemá. */
export async function loadProjectWebLeads(clientId: string, memberId: string, projectId: string): Promise<WebLeadStats | null> {
  try {
    const [rows] = await portalDb({ clientId }).batch([WEB_LEADS_SQL(memberId)])
    return webLeadsByProject(rows).get(projectId) ?? null
  } catch (err) {
    if (TOLERATED.has(pgCode(err) ?? '')) return null
    throw err
  }
}
