import 'server-only'
import { z } from 'zod'
import { batchTolerant, q } from '@/lib/admin/db'

/**
 * AI leady v Hovorech (AD16).
 *
 * `agent_leads` se od migrace 052 plní z externího vizeon-lead-agent
 * a **nikdo je neviděl** — grep v repu našel jediný výskyt, INSERT v route
 * handleru. Tabulka přitom nese skóre, prioritu, shrnutí i doporučenou
 * strategii komunikace.
 *
 * Dvě pravidla, která platí pro všechno, co odsud vyleze:
 *  1. `summary` a `communication_strategy` jsou **text od modelu o skutečném
 *     člověku**. Nikdy se nevykreslují jako HTML (React escapuje sám) a nikdy
 *     neodcházejí klientovi — je to poznámka pro Kryštofa, ne pravda o něm.
 *  2. `client_*` je naopak tvrzení člověka z formuláře. Schéma je drží
 *     odděleně a tenhle modul to pořadí nemíchá.
 *
 * Bez migrace 112 chybí `handled_at`. Dotaz se na sloupec ptá přes `to_jsonb`,
 * takže projde na databázi s migrací i bez ní — tabulka je malá (desítky
 * řádků), takže index tu nic nerozhoduje.
 */

const strategySchema = z.object({
  tone: z.string().max(400).optional(),
  style: z.string().max(400).optional(),
  focus: z.array(z.string().max(200)).max(10).optional(),
  avoid: z.array(z.string().max(200)).max(10).optional(),
})

export type AgentLeadStrategy = z.infer<typeof strategySchema>

export type AgentLeadRow = {
  id: string
  receivedAt: string
  score: number
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  clientName: string
  clientEmail: string
  clientPhone: string | null
  clientCompany: string | null
  clientService: string
  clientBudget: string | null
  clientDeadline: string | null
  clientMessage: string | null
  industry: string | null
  companyType: string | null
  /** Shrnutí od modelu. Interní poznámka, ne fakt. */
  summary: string
  strategy: AgentLeadStrategy
}

/** Kolik se jich ukáže. Víc než pět čekajících leadů je stejně práce na dny. */
const LIMIT = 10

export type AgentLeadsStrip = { rows: AgentLeadRow[]; total: number }

function toRow(raw: Record<string, unknown>): AgentLeadRow {
  const parsed = strategySchema.safeParse(
    typeof raw.communication_strategy === 'string'
      ? safeJson(raw.communication_strategy)
      : raw.communication_strategy,
  )
  const priority = String(raw.priority ?? 'LOW').toUpperCase()
  return {
    id: String(raw.id),
    receivedAt: String(raw.received_at),
    score: Number(raw.lead_score ?? 0),
    priority: priority === 'HIGH' || priority === 'MEDIUM' ? priority : 'LOW',
    clientName: String(raw.client_name ?? ''),
    clientEmail: String(raw.client_email ?? ''),
    clientPhone: raw.client_phone === null || raw.client_phone === undefined ? null : String(raw.client_phone),
    clientCompany: raw.client_company === null || raw.client_company === undefined ? null : String(raw.client_company),
    clientService: String(raw.client_service ?? ''),
    clientBudget: raw.client_budget === null || raw.client_budget === undefined ? null : String(raw.client_budget),
    clientDeadline: raw.client_deadline === null || raw.client_deadline === undefined ? null : String(raw.client_deadline),
    clientMessage: raw.client_message === null || raw.client_message === undefined ? null : String(raw.client_message),
    industry: raw.industry === null || raw.industry === undefined ? null : String(raw.industry),
    companyType: raw.company_type === null || raw.company_type === undefined ? null : String(raw.company_type),
    summary: String(raw.summary ?? ''),
    strategy: parsed.success ? parsed.data : {},
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Nevyřízené AI leady, nejvyšší skóre nahoře. */
export async function loadAgentLeads(): Promise<AgentLeadsStrip> {
  const open = `to_jsonb(agent_leads) ->> 'handled_at' IS NULL`
  const [rows, counts] = await batchTolerant([
    q`SELECT id::text, received_at, lead_score, priority, client_name, client_email, client_phone,
             client_company, client_service, client_budget, client_deadline, client_message,
             industry, company_type, summary, communication_strategy
        FROM agent_leads
        WHERE to_jsonb(agent_leads) ->> 'handled_at' IS NULL
        ORDER BY lead_score DESC, received_at DESC
        LIMIT ${LIMIT}`,
    { text: `SELECT count(*)::int AS pocet FROM agent_leads WHERE ${open}`, params: [] },
  ])

  return {
    rows: (rows as Record<string, unknown>[]).map(toRow),
    total: Number((counts[0] as { pocet?: number } | undefined)?.pocet ?? 0),
  }
}
