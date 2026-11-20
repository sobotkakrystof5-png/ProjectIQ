import 'server-only'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { ChatThreadSummary } from '@/lib/chat/types'
import { CONSULTATION_LIST_DAYS, type FreeSlot } from '@/lib/consultations/rules'
import { portalDb, pq, type PortalQuery, type PortalRow } from './db'
import { PROJECT_SELECT_SQL, projectFromRow, type PortalProject, type ProjectRow } from './projects'
import { currentPhase, openTasks, phasesFromRows, type PortalPhase } from './phases'
import { INVOICE_COLUMNS, invoiceFromRow, type PortalInvoice, type PortalMoney } from './money'
import { consultationFromRow, type PortalConsultation } from './consultations'
import { CLIENT_SURVEYS_SQL, surveyFromRow, type ClientSurvey } from './survey'
import { WEB_LEADS_SQL, webLeadsByProject } from './web-leads'
import type { WebLeadStats } from '@/lib/client-web/stats'

/**
 * Přehled klienta (KP16, R-121, R-123): všechny zakázky klienta jedním
 * požadavkem do databáze — etapy, peníze, faktury, konzultace, zprávy ke
 * schválení a dotazník. Z toho se skládá „Čeká na vás" a karta každé zakázky.
 *
 * Vše přes portalDb(clientId) — RLS a výslovný filtr client_id. Když některá
 * část ještě není v databázi (migrace 121–125 nebo práva z portal-grants.sql),
 * dotazy se pustí jednotlivě a chybějící část je prázdná; přehled nespadne.
 */

export interface OverviewProject {
  project: PortalProject
  phases: PortalPhase[]
  current: PortalPhase | null
  money: PortalMoney | null
  invoices: PortalInvoice[]
  consultations: PortalConsultation[]
  unread: number
  survey: ClientSurvey | null
  /** Poptávky z webu po měsících (KP17); `null` = zakázka nemá napojený web. */
  webLeads: WebLeadStats | null
}

export type { ClientSurvey }

export type WaitingItem =
  | { kind: 'approval'; projectId: string; projectName: string; messageId: string; body: string }
  | { kind: 'task'; projectId: string; projectName: string; taskId: string; body: string; phaseName: string }
  | { kind: 'unread'; projectId: string; projectName: string; count: number }
  | { kind: 'invoice'; projectId: string; projectName: string; invoice: PortalInvoice }
  | { kind: 'survey'; projectId: string; projectName: string }

export interface ClientOverview {
  projects: OverviewProject[]
  waiting: WaitingItem[]
  freeSlots: FreeSlot[]
  consultationsEnabled: boolean
}

// Chybějící tabulka, funkce nebo právo = ta část ještě není nasazená.
const TOLERATED = new Set(['42P01', '42883', '42501', '42703'])

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

/** Jedna transakce; když v ní chybí kus schématu, každý dotaz zvlášť a chybějící = prázdný. */
async function tolerantBatch(clientId: string, queries: PortalQuery[]): Promise<(PortalRow[] | null)[]> {
  const db = portalDb({ clientId })
  try {
    return await db.batch(queries)
  } catch (err) {
    if (!TOLERATED.has(pgCode(err) ?? '')) throw err
  }
  return Promise.all(
    queries.map((q) =>
      db.batch([q]).then(
        ([rows]) => rows,
        (err: unknown) => {
          const code = pgCode(err) ?? ''
          if (code === '42501') console.error('[klient] přehled: portal_app nemá práva, pusťte scripts/portal-create-role.js')
          if (TOLERATED.has(code)) return null
          throw err
        },
      ),
    ),
  )
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Začátek zprávy ke schválení pro řádek „Čeká na vás" — jen text, bez zalomení. */
const snippet = (body: unknown): string => {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 120 ? `${text.slice(0, 117)}…` : text
}

export async function loadClientOverview(
  clientId: string,
  memberId: string,
  threads: ChatThreadSummary[],
): Promise<ClientOverview> {
  const now = new Date()
  const until = new Date(now.getTime() + CONSULTATION_LIST_DAYS * 86_400_000)
  const [projectRows, phaseRows, taskRows, moneyRows, invoiceRows, consultationRows, slotRows, approvalRows, surveyRows, webLeadRows] =
    await tolerantBatch(clientId, [
      { text: `${PROJECT_SELECT_SQL} WHERE p.client_id = $1 ORDER BY p.updated_at DESC`, params: [clientId] },
      pq`SELECT id, project_id, name, description, due_date, status, done_at FROM portal.phases
         WHERE client_id = ${clientId} ORDER BY project_id, position`,
      pq`SELECT id, project_id, phase_id, body, done_at FROM portal.phase_tasks
         WHERE client_id = ${clientId} ORDER BY project_id, phase_id, position`,
      pq`SELECT project_id, price, paid, remaining FROM portal.project_money WHERE client_id = ${clientId}`,
      {
        text: `SELECT project_id, ${INVOICE_COLUMNS} FROM portal.invoices
               WHERE client_id = $1 ORDER BY issued_on DESC, number DESC`,
        params: [clientId],
      },
      pq`SELECT id::text, project_id, starts_at, ends_at, topic, channel, meet_url, meet_pending
         FROM portal.consultations
         WHERE client_id = ${clientId} AND ends_at > now() ORDER BY starts_at LIMIT 50`,
      pq`SELECT starts_at, ends_at FROM portal.free_consultation_slots(${now.toISOString()}, ${until.toISOString()})`,
      pq`SELECT id::text, project_id, body FROM portal.messages
         WHERE client_id = ${clientId} AND kind = 'approval' AND approval_state = 'pending'
         ORDER BY created_at`,
      CLIENT_SURVEYS_SQL(memberId),
      WEB_LEADS_SQL(memberId),
    ])

  const todayIso = getPragueTodayISO()
  const rowsOf = (rows: PortalRow[] | null, projectId: string) => (rows ?? []).filter((r) => String(r.project_id) === projectId)
  const unreadBy = new Map(threads.map((t) => [t.projectId, t.unread]))
  const webLeads = webLeadsByProject(webLeadRows)

  const projects: OverviewProject[] = (projectRows ?? []).map((row) => {
    const project = projectFromRow(row as unknown as ProjectRow)
    const phases = phasesFromRows(rowsOf(phaseRows, project.id), rowsOf(taskRows, project.id))
    const m = rowsOf(moneyRows, project.id)[0]
    const price = m ? num(m.price) : 0
    const s = rowsOf(surveyRows, project.id)[0]
    return {
      project,
      phases,
      current: currentPhase(phases),
      money: m && price > 0 ? { price, paid: num(m.paid), remaining: num(m.remaining), currency: 'CZK' } : null,
      invoices: rowsOf(invoiceRows, project.id).map((r) => invoiceFromRow(r, todayIso)),
      consultations: rowsOf(consultationRows, project.id).map(consultationFromRow),
      unread: unreadBy.get(project.id) ?? 0,
      survey: surveyFromRow(s),
      webLeads: webLeads.get(project.id) ?? null,
    }
  })

  return {
    projects,
    waiting: waitingItems(projects, approvalRows ?? []),
    freeSlots: (slotRows ?? []).map((r) => ({
      startsAt: new Date(r.starts_at as string).toISOString(),
      endsAt: new Date(r.ends_at as string).toISOString(),
    })),
    consultationsEnabled: consultationRows !== null && slotRows !== null,
  }
}

/**
 * Co čeká na klienta, v pořadí, ve kterém na tom nejvíc záleží: rozhodnutí
 * (schválení), úkol z etapy, nepřečtené zprávy, faktura po splatnosti,
 * hodnocení hotové zakázky.
 */
export function waitingItems(projects: OverviewProject[], approvalRows: PortalRow[]): WaitingItem[] {
  const name = new Map(projects.map((p) => [p.project.id, p.project.name]))
  const items: WaitingItem[] = []
  for (const r of approvalRows) {
    const projectId = String(r.project_id)
    const projectName = name.get(projectId)
    if (projectName) items.push({ kind: 'approval', projectId, projectName, messageId: String(r.id), body: snippet(r.body) })
  }
  for (const p of projects) {
    for (const { task, phase } of openTasks(p.phases)) {
      items.push({ kind: 'task', projectId: p.project.id, projectName: p.project.name, taskId: task.id, body: task.body, phaseName: phase.name })
    }
  }
  for (const p of projects) {
    if (p.unread > 0) items.push({ kind: 'unread', projectId: p.project.id, projectName: p.project.name, count: p.unread })
  }
  for (const p of projects) {
    for (const invoice of p.invoices) {
      if (invoice.state === 'overdue') items.push({ kind: 'invoice', projectId: p.project.id, projectName: p.project.name, invoice })
    }
  }
  for (const p of projects) {
    if (p.survey && !p.survey.completed) items.push({ kind: 'survey', projectId: p.project.id, projectName: p.project.name })
  }
  return items
}
