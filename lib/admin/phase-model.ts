import { z } from 'zod'

// Služby a etapy zakázky (KP12, R-121, D-K14). Čisté funkce a schémata bez
// databáze — sdílí je formulář zakázky, Nastavení › Služby, server actions
// i testy. Obsah šablon píše Kryštof; tady se nic nevymýšlí, jen počítá.

export const PHASE_STATUSES = ['waiting', 'running', 'done'] as const
export type PhaseStatus = (typeof PHASE_STATUSES)[number]

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  waiting: 'Čeká',
  running: 'Běží',
  done: 'Hotovo',
}

/** Prázdné služby, které nabízí prázdný stav Nastavení › Služby (bez etap). */
export const SUGGESTED_SERVICES = ['Web', 'E-shop', 'Design', 'Automatizace'] as const

export const PHASE_LIMITS = {
  serviceName: 80,
  phaseName: 120,
  description: 1000,
  task: 300,
  tasksPerPhase: 20,
  phases: 30,
  typicalDays: 365,
} as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDay(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const isoDay = z.string().refine(isIsoDay, 'Datum není platné.')

const taskText = z
  .string()
  .trim()
  .min(1, 'Úkol nesmí být prázdný.')
  .max(PHASE_LIMITS.task, `Úkol může mít nejvýše ${PHASE_LIMITS.task} znaků.`)

const tasks = z.array(taskText).max(PHASE_LIMITS.tasksPerPhase, `Etapa může mít nejvýše ${PHASE_LIMITS.tasksPerPhase} úkolů.`)

const phaseName = z
  .string()
  .trim()
  .min(1, 'Každá etapa potřebuje název.')
  .max(PHASE_LIMITS.phaseName, `Název etapy může mít nejvýše ${PHASE_LIMITS.phaseName} znaků.`)

const description = z
  .string()
  .trim()
  .max(PHASE_LIMITS.description, `Popis může mít nejvýše ${PHASE_LIMITS.description} znaků.`)

export const serviceNameSchema = z
  .string()
  .trim()
  .min(1, 'Napište název služby.')
  .max(PHASE_LIMITS.serviceName, `Název služby může mít nejvýše ${PHASE_LIMITS.serviceName} znaků.`)

/** Etapa v šabloně služby. */
export const phaseTemplateSchema = z.object({
  name: phaseName,
  description,
  typicalDays: z.number().int().min(0).max(PHASE_LIMITS.typicalDays, `Délka může být nejvýše ${PHASE_LIMITS.typicalDays} dní.`).nullable(),
  tasks,
})

export const serviceSchema = z.object({
  name: serviceNameSchema,
  active: z.boolean(),
  phases: z.array(phaseTemplateSchema).max(PHASE_LIMITS.phases, `Služba může mít nejvýše ${PHASE_LIMITS.phases} etap.`),
})

/** Etapa zakázky před uložením (náhled u nové zakázky, „Přidat etapy"). */
export const phaseDraftSchema = z.object({
  name: phaseName,
  description,
  dueDate: isoDay.nullable(),
  tasks,
})

export const phaseDraftsSchema = z
  .array(phaseDraftSchema)
  .min(1, 'Přidejte aspoň jednu etapu.')
  .max(PHASE_LIMITS.phases, `Zakázka může mít nejvýše ${PHASE_LIMITS.phases} etap.`)

export type PhaseTemplate = z.infer<typeof phaseTemplateSchema>
export type ServiceInput = z.infer<typeof serviceSchema>
export type PhaseDraft = z.infer<typeof phaseDraftSchema>

export interface ServiceTemplate {
  id: string
  name: string
  active: boolean
  phases: PhaseTemplate[]
}

export interface ProjectPhaseTask {
  id: string
  body: string
  /** Kdy úkol klient v prostoru označil jako hotový, ISO. */
  clientDoneAt: string | null
}

export interface ProjectPhase {
  id: string
  position: number
  name: string
  description: string | null
  dueDate: string | null
  status: PhaseStatus
  doneAt: string | null
  tasks: ProjectPhaseTask[]
}

export function isPhaseStatus(value: unknown): value is PhaseStatus {
  return typeof value === 'string' && (PHASE_STATUSES as readonly string[]).includes(value)
}

/** `YYYY-MM-DD` + dny, kalendářně (bez časového pásma). */
export function addDays(isoDayValue: string, days: number): string {
  const d = new Date(`${isoDayValue}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Etapy nové zakázky ze šablony. Termín etapy = začátek + součet typických
 * délek až po ni. Etapa bez délky termín nemá a termíny dalších neposouvá.
 * Vrací kopii — úprava šablony později běžící zakázku nezmění.
 */
export function draftsFromTemplate(phases: readonly PhaseTemplate[], startDay: string): PhaseDraft[] {
  let cursor = startDay
  return phases.map((p) => {
    let dueDate: string | null = null
    if (p.typicalDays !== null) {
      cursor = addDays(cursor, p.typicalDays)
      dueDate = cursor
    }
    return { name: p.name, description: p.description, dueDate, tasks: [...p.tasks] }
  })
}

/** Postup v % z etap — stejný výpočet jako trigger `project_phases_progress` (D-K14). */
export function progressFromPhases(phases: readonly { status: PhaseStatus }[]): number | null {
  if (phases.length === 0) return null
  const done = phases.filter((p) => p.status === 'done').length
  return Math.round((100 * done) / phases.length)
}

/** Aktuální etapa: první běžící, jinak první čekající; všechno hotové = -1. */
export function currentPhaseIndex(phases: readonly { status: PhaseStatus }[]): number {
  const running = phases.findIndex((p) => p.status === 'running')
  if (running >= 0) return running
  return phases.findIndex((p) => p.status === 'waiting')
}

/** Počet s českým tvarem: 1 etapa, 2–4 etapy, 0 a 5+ etap. */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const word = n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2]
  return `${n} ${word}`
}

export const PHASE_FORMS = ['etapa', 'etapy', 'etap'] as const
export const TASK_FORMS = ['úkol', 'úkoly', 'úkolů'] as const

/** Řádky textového pole → úkoly (prázdné řádky pryč). */
export function tasksFromLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
