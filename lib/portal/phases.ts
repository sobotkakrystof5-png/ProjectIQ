import 'server-only'
import { portalDb, pq } from './db'

// Etapy zakázky v klientském prostoru (KP12, migrace 121). Čte projekce
// portal.phases a portal.phase_tasks přes portalDb(clientId), RLS a výslovný
// filtr client_id. Bez migrace nebo bez práv (grants po migraci) se vrátí
// prázdný seznam a stránka vypadá jako dřív.

export type PortalPhaseStatus = 'waiting' | 'running' | 'done'

export interface PortalTask {
  id: string
  body: string
  doneAt: string | null
}

export interface PortalPhase {
  id: string
  name: string
  description: string | null
  dueDate: string | null
  status: PortalPhaseStatus
  doneAt: string | null
  tasks: PortalTask[]
}

const TOLERATED = new Set(['42P01', '42501'])

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(String(v)).toISOString())
const day = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}
const status = (v: unknown): PortalPhaseStatus => (v === 'running' || v === 'done' ? v : 'waiting')

export async function loadClientPhases(clientId: string, projectId: string): Promise<PortalPhase[]> {
  let phases: Record<string, unknown>[]
  let tasks: Record<string, unknown>[]
  try {
    ;[phases, tasks] = await portalDb({ clientId }).batch([
      pq`SELECT id, name, description, due_date, status, done_at FROM portal.phases
         WHERE client_id = ${clientId} AND project_id = ${projectId} ORDER BY position`,
      pq`SELECT id, phase_id, body, done_at FROM portal.phase_tasks
         WHERE client_id = ${clientId} AND project_id = ${projectId} ORDER BY phase_id, position`,
    ])
  } catch (err) {
    const code = pgCode(err) ?? ''
    // 42501 = migrace 121 proběhla, ale chybí práva z portal-grants.sql — ať se to pozná.
    if (code === '42501') console.error('[klient] etapy: portal_app nemá práva, pusťte scripts/portal-create-role.js')
    if (TOLERATED.has(code)) return []
    throw err
  }
  return phasesFromRows(phases, tasks)
}

/** Řádky projekcí portal.phases a portal.phase_tasks (seřazené podle pořadí) → etapy s úkoly. */
export function phasesFromRows(phases: Record<string, unknown>[], tasks: Record<string, unknown>[]): PortalPhase[] {
  const byPhase = new Map<string, PortalTask[]>()
  for (const t of tasks) {
    const list = byPhase.get(String(t.phase_id)) ?? []
    list.push({ id: String(t.id), body: String(t.body), doneAt: iso(t.done_at) })
    byPhase.set(String(t.phase_id), list)
  }
  return phases.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    description: p.description == null ? null : String(p.description),
    dueDate: day(p.due_date),
    status: status(p.status),
    doneAt: iso(p.done_at),
    tasks: byPhase.get(String(p.id)) ?? [],
  }))
}

/** Etapa, na které se teď pracuje: probíhající, jinak první čekající. */
export function currentPhase(phases: PortalPhase[]): PortalPhase | null {
  return phases.find((p) => p.status === 'running') ?? phases.find((p) => p.status === 'waiting') ?? null
}

/** Úkoly pro klienta v etapách, které ještě nejsou hotové (u hotové etapy už nejsou potřeba). */
export function openTasks(phases: PortalPhase[]): { task: PortalTask; phase: PortalPhase }[] {
  return phases.flatMap((phase) => (phase.status === 'done' ? [] : phase.tasks.filter((t) => !t.doneAt).map((task) => ({ task, phase }))))
}
