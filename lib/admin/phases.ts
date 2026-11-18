import 'server-only'
import { adminDb, q, type AdminRow } from '@/lib/admin/db'
import {
  SUGGESTED_SERVICES,
  isPhaseStatus,
  type PhaseDraft,
  type PhaseStatus,
  type PhaseTemplate,
  type ProjectPhase,
  type ServiceInput,
  type ServiceTemplate,
} from '@/lib/admin/phase-model'

// Služby a etapy zakázky v adminu (KP12, migrace 121). Čte a píše vlastník
// tabulek přes `adminDb`; do klientského prostoru se etapy dostanou triggerem
// (portal.sync_phase), ne odsud. Bez migrace 121 se čtení vrátí `null`
// a obrazovky se schovají — admin běží dál jako dřív.

const UNDEFINED_TABLE = '42P01'

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

/** Chybí tabulky z migrace 121? Pak se funkce tváří, že etapy nejsou. */
function isMissingMigration(err: unknown): boolean {
  return pgCode(err) === UNDEFINED_TABLE
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(String(v)).toISOString())
const day = (v: unknown): string | null => {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

// ─── Služby ──────────────────────────────────────────────────────────────────

function toServices(serviceRows: AdminRow[], phaseRows: AdminRow[]): ServiceTemplate[] {
  const byService = new Map<string, PhaseTemplate[]>()
  for (const r of phaseRows) {
    const list = byService.get(String(r.service_id)) ?? []
    list.push({
      name: String(r.name),
      description: r.client_description == null ? '' : String(r.client_description),
      typicalDays: r.typical_days == null ? null : Number(r.typical_days),
      tasks: Array.isArray(r.client_tasks) ? r.client_tasks.map(String) : [],
    })
    byService.set(String(r.service_id), list)
  }
  return serviceRows.map((s) => ({
    id: String(s.id),
    name: String(s.name),
    active: Boolean(s.active),
    phases: byService.get(String(s.id)) ?? [],
  }))
}

/** Všechny služby s etapami, v pořadí z Nastavení. `null` = migrace 121 chybí. */
export async function loadServices(options: { activeOnly?: boolean } = {}): Promise<ServiceTemplate[] | null> {
  try {
    const [services, phases] = await adminDb.batch([
      options.activeOnly
        ? q`SELECT id, name, active FROM service_templates WHERE active ORDER BY position, lower(name)`
        : q`SELECT id, name, active FROM service_templates ORDER BY position, lower(name)`,
      q`SELECT service_id, name, client_description, typical_days, client_tasks
        FROM service_phase_templates ORDER BY service_id, position`,
    ])
    return toServices(services, phases)
  } catch (err) {
    if (isMissingMigration(err)) return null
    throw err
  }
}

export async function createService(name: string): Promise<string> {
  const rows = await adminDb<{ id: string }>`
    INSERT INTO service_templates (name, position)
    SELECT ${name}, coalesce(max(position), 0) + 1 FROM service_templates
    RETURNING id
  `
  return String(rows[0].id)
}

/** Prázdné služby Web, E-shop, Design, Automatizace; existující název se přeskočí. */
export async function createSuggestedServices(): Promise<number> {
  const rows = await adminDb<{ id: string }>`
    INSERT INTO service_templates (name, position)
    SELECT n.name, coalesce((SELECT max(position) FROM service_templates), 0) + n.ord
    FROM unnest(${[...SUGGESTED_SERVICES]}::text[]) WITH ORDINALITY AS n(name, ord)
    ON CONFLICT ((lower(btrim(name)))) DO NOTHING
    RETURNING id
  `
  return rows.length
}

/**
 * Uloží službu celou: název, nabízení a etapy v novém pořadí. Etapy šablony se
 * nahradí v jedné transakci — zakázky mají vlastní kopie, takže je to bezpečné.
 */
export async function saveService(id: string, input: ServiceInput): Promise<boolean> {
  const phases = input.phases.map((p, i) => ({
    position: i + 1,
    name: p.name,
    description: p.description || null,
    typicalDays: p.typicalDays,
    tasks: p.tasks,
  }))
  const [updated] = await adminDb.batch([
    q`UPDATE service_templates SET name = ${input.name}, active = ${input.active}, updated_at = now()
      WHERE id = ${id} RETURNING id`,
    q`DELETE FROM service_phase_templates WHERE service_id = ${id}
      AND EXISTS (SELECT 1 FROM service_templates WHERE id = ${id})`,
    q`INSERT INTO service_phase_templates (service_id, position, name, client_description, typical_days, client_tasks)
      SELECT ${id}, (x->>'position')::int, x->>'name', x->>'description',
             (x->>'typicalDays')::int,
             ARRAY(SELECT jsonb_array_elements_text(x->'tasks'))
      FROM jsonb_array_elements(${JSON.stringify(phases)}::jsonb) AS x
      WHERE EXISTS (SELECT 1 FROM service_templates WHERE id = ${id})`,
  ])
  return updated.length > 0
}

/** Smaže službu a vrátí ji celou, aby šlo „Zpět". Zakázky si etapy nechají. */
export async function deleteService(id: string): Promise<(ServiceInput & { position: number }) | null> {
  const [service, phases] = await adminDb.batch([
    q`SELECT name, active, position FROM service_templates WHERE id = ${id}`,
    q`SELECT name, client_description, typical_days, client_tasks
      FROM service_phase_templates WHERE service_id = ${id} ORDER BY position`,
    q`DELETE FROM service_templates WHERE id = ${id}`,
  ])
  const s = service[0]
  if (!s) return null
  return {
    name: String(s.name),
    active: Boolean(s.active),
    position: Number(s.position),
    phases: toServices([{ id, name: s.name, active: s.active }], phases.map((p) => ({ ...p, service_id: id })))[0].phases,
  }
}

/** „Zpět" po smazání: služba se vrátí se stejným id, pořadím i etapami. */
export async function restoreService(id: string, snapshot: ServiceInput & { position: number }): Promise<void> {
  await adminDb.batch([
    q`INSERT INTO service_templates (id, name, active, position) VALUES (${id}, ${snapshot.name}, ${snapshot.active}, ${snapshot.position})
      ON CONFLICT (id) DO NOTHING`,
  ])
  await saveService(id, snapshot)
}

// ─── Etapy zakázky ───────────────────────────────────────────────────────────

function toPhases(phaseRows: AdminRow[], taskRows: AdminRow[]): ProjectPhase[] {
  const tasksByPhase = new Map<string, ProjectPhase['tasks']>()
  for (const t of taskRows) {
    const list = tasksByPhase.get(String(t.phase_id)) ?? []
    list.push({ id: String(t.id), body: String(t.body), clientDoneAt: iso(t.client_done_at) })
    tasksByPhase.set(String(t.phase_id), list)
  }
  return phaseRows.map((p) => ({
    id: String(p.id),
    position: Number(p.position),
    name: String(p.name),
    description: p.client_description == null ? null : String(p.client_description),
    dueDate: day(p.due_date),
    status: isPhaseStatus(p.status) ? p.status : 'waiting',
    doneAt: iso(p.done_at),
    tasks: tasksByPhase.get(String(p.id)) ?? [],
  }))
}

/** Etapy zakázky s úkoly. `null` = migrace 121 chybí. */
export async function loadProjectPhases(projectId: string): Promise<ProjectPhase[] | null> {
  try {
    const [phases, tasks] = await adminDb.batch([
      q`SELECT id, position, name, client_description, due_date, status, done_at
        FROM project_phases WHERE project_id = ${projectId} ORDER BY position`,
      q`SELECT id, phase_id, body, client_done_at
        FROM project_phase_tasks WHERE project_id = ${projectId} ORDER BY phase_id, position`,
    ])
    return toPhases(phases, tasks)
  } catch (err) {
    if (isMissingMigration(err)) return null
    throw err
  }
}

/** Má zakázka etapy? Bez migrace 121 ne — pak platí ruční % jako dřív. */
export async function projectHasPhases(projectId: string): Promise<boolean> {
  try {
    const rows = await adminDb`SELECT 1 FROM project_phases WHERE project_id = ${projectId} LIMIT 1`
    return rows.length > 0
  } catch (err) {
    if (isMissingMigration(err)) return false
    throw err
  }
}

/**
 * Zapíše etapy a úkoly zakázce, která ještě žádné nemá (jeden příkaz, takže
 * buď všechno, nebo nic). Vrací počet založených etap; 0 = zakázka už etapy
 * měla nebo neexistuje.
 */
export async function initProjectPhases(projectId: string, drafts: PhaseDraft[]): Promise<number> {
  const input = drafts.map((d, i) => ({
    position: i + 1,
    name: d.name,
    description: d.description || null,
    dueDate: d.dueDate,
    tasks: d.tasks,
  }))
  const rows = await adminDb<{ phases: number }>`
    WITH input AS (
      SELECT (x->>'position')::int AS position, x->>'name' AS name, x->>'description' AS description,
             (x->>'dueDate')::date AS due_date, x->'tasks' AS tasks
      FROM jsonb_array_elements(${JSON.stringify(input)}::jsonb) AS x
    ),
    target AS (
      SELECT p.id FROM projects p
      WHERE p.id = ${projectId} AND NOT EXISTS (SELECT 1 FROM project_phases ph WHERE ph.project_id = p.id)
    ),
    ins AS (
      INSERT INTO project_phases (project_id, position, name, client_description, due_date)
      SELECT target.id, input.position, input.name, input.description, input.due_date FROM target, input
      RETURNING id, position
    ),
    tasks AS (
      INSERT INTO project_phase_tasks (project_id, phase_id, position, body)
      SELECT ${projectId}, ins.id, t.ord, t.body
      FROM ins JOIN input ON input.position = ins.position,
           jsonb_array_elements_text(input.tasks) WITH ORDINALITY AS t(body, ord)
      RETURNING id
    )
    SELECT (SELECT count(*) FROM ins)::int AS phases
  `
  return Number(rows[0]?.phases ?? 0)
}

/** Nový stav etapy. Vrací zakázku a předchozí stav pro „Zpět". */
export async function setPhaseStatus(
  phaseId: string,
  status: PhaseStatus,
): Promise<{ projectId: string; previous: PhaseStatus } | null> {
  const rows = await adminDb`
    UPDATE project_phases p
    SET status = ${status},
        done_at = CASE WHEN ${status} = 'done' THEN coalesce(p.done_at, now()) END,
        updated_at = now()
    FROM (SELECT id, status AS previous FROM project_phases WHERE id = ${phaseId} FOR UPDATE) o
    WHERE p.id = o.id
    RETURNING p.project_id, o.previous
  `
  const r = rows[0]
  if (!r) return null
  return { projectId: String(r.project_id), previous: isPhaseStatus(r.previous) ? r.previous : 'waiting' }
}

/** Nový termín etapy. Vrací zakázku a předchozí termín pro „Zpět". */
export async function setPhaseDueDate(
  phaseId: string,
  dueDate: string | null,
): Promise<{ projectId: string; previous: string | null } | null> {
  const rows = await adminDb`
    UPDATE project_phases p SET due_date = ${dueDate}::date, updated_at = now()
    FROM (SELECT id, due_date AS previous FROM project_phases WHERE id = ${phaseId} FOR UPDATE) o
    WHERE p.id = o.id
    RETURNING p.project_id, o.previous
  `
  const r = rows[0]
  if (!r) return null
  return { projectId: String(r.project_id), previous: day(r.previous) }
}
