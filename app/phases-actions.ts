'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { projectPath } from '@/lib/lead-origins'
import {
  PHASE_STATUSES,
  isIsoDay,
  phaseDraftsSchema,
  serviceNameSchema,
  serviceSchema,
  type PhaseStatus,
  type ServiceInput,
} from '@/lib/admin/phase-model'
import {
  createService,
  createSuggestedServices,
  deleteService,
  initProjectPhases,
  restoreService,
  saveService,
  setPhaseDueDate,
  setPhaseStatus,
} from '@/lib/admin/phases'

// Služby a etapy zakázky (KP12, R-121). Všechno za přihlášením adminu, vstup
// přes Zod, výsledek jako `Result` bez výjimky do UI. Do klientského prostoru
// se změny propíšou triggerem v databázi (migrace 121).

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const SERVICES_PATH = '/dashboard/sluzby'
const uuid = z.string().uuid()
const GENERIC = 'Něco se nepovedlo. Zkuste to prosím znovu.'

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

function fail(err: unknown, context: string): { ok: false; error: string } {
  const code = pgCode(err)
  if (code === '23505') return { ok: false, error: 'Služba s tímhle názvem už existuje.' }
  if (code === '42P01') return { ok: false, error: 'Služby a etapy ještě nejsou v databázi zapnuté (chybí migrace 121).' }
  console.error(`[etapy] ${context}:`, err instanceof Error ? err.name : 'unknown')
  return { ok: false, error: GENERIC }
}

const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? 'Zkontrolujte prosím údaje.'

// ─── Nastavení › Služby ──────────────────────────────────────────────────────

export async function addServiceAction(name: string): Promise<Result<{ id: string }>> {
  await requireAuth()
  const parsed = serviceNameSchema.safeParse(name)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  try {
    const id = await createService(parsed.data)
    revalidatePath(SERVICES_PATH)
    return { ok: true, id }
  } catch (err) {
    return fail(err, 'přidání služby')
  }
}

export async function addSuggestedServicesAction(): Promise<Result<{ created: number }>> {
  await requireAuth()
  try {
    const created = await createSuggestedServices()
    revalidatePath(SERVICES_PATH)
    return { ok: true, created }
  } catch (err) {
    return fail(err, 'navržené služby')
  }
}

export async function saveServiceAction(id: string, input: ServiceInput): Promise<Result> {
  await requireAuth()
  const idOk = uuid.safeParse(id)
  const parsed = serviceSchema.safeParse(input)
  if (!idOk.success) return { ok: false, error: 'Služba nebyla nalezena.' }
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  try {
    const saved = await saveService(idOk.data, parsed.data)
    if (!saved) return { ok: false, error: 'Služba nebyla nalezena. Možná ji mezitím někdo smazal.' }
    revalidatePath(SERVICES_PATH)
    revalidatePath('/dashboard/new')
    return { ok: true }
  } catch (err) {
    return fail(err, 'uložení služby')
  }
}

const snapshotSchema = serviceSchema.extend({ position: z.number().int().min(0).max(100_000) })
export type ServiceSnapshot = z.infer<typeof snapshotSchema>

export async function deleteServiceAction(id: string): Promise<Result<{ snapshot: ServiceSnapshot }>> {
  await requireAuth()
  const idOk = uuid.safeParse(id)
  if (!idOk.success) return { ok: false, error: 'Služba nebyla nalezena.' }
  try {
    const snapshot = await deleteService(idOk.data)
    if (!snapshot) return { ok: false, error: 'Služba nebyla nalezena.' }
    revalidatePath(SERVICES_PATH)
    return { ok: true, snapshot }
  } catch (err) {
    return fail(err, 'smazání služby')
  }
}

export async function restoreServiceAction(id: string, snapshot: ServiceSnapshot): Promise<Result> {
  await requireAuth()
  const idOk = uuid.safeParse(id)
  const parsed = snapshotSchema.safeParse(snapshot)
  if (!idOk.success || !parsed.success) return { ok: false, error: 'Službu se nepodařilo vrátit.' }
  try {
    await restoreService(idOk.data, parsed.data)
    revalidatePath(SERVICES_PATH)
    return { ok: true }
  } catch (err) {
    return fail(err, 'vrácení služby')
  }
}

// ─── Etapy zakázky ───────────────────────────────────────────────────────────

/** Etapy pro zakázku, která ještě žádné nemá (detail zakázky › Přidat etapy). */
export async function addProjectPhasesAction(projectId: string, drafts: unknown): Promise<Result<{ count: number }>> {
  await requireAuth()
  const idOk = uuid.safeParse(projectId)
  const parsed = phaseDraftsSchema.safeParse(drafts)
  if (!idOk.success) return { ok: false, error: 'Zakázka nebyla nalezena.' }
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  try {
    const count = await initProjectPhases(idOk.data, parsed.data)
    if (count === 0) return { ok: false, error: 'Zakázka už etapy má. Obnovte stránku.' }
    revalidatePath(projectPath(idOk.data))
    return { ok: true, count }
  } catch (err) {
    return fail(err, 'přidání etap')
  }
}

export async function setPhaseStatusAction(phaseId: string, status: PhaseStatus): Promise<Result<{ previous: PhaseStatus }>> {
  await requireAuth()
  const idOk = uuid.safeParse(phaseId)
  const statusOk = z.enum(PHASE_STATUSES).safeParse(status)
  if (!idOk.success || !statusOk.success) return { ok: false, error: 'Etapa nebyla nalezena.' }
  try {
    const result = await setPhaseStatus(idOk.data, statusOk.data)
    if (!result) return { ok: false, error: 'Etapa nebyla nalezena. Možná ji mezitím někdo smazal.' }
    revalidatePath(projectPath(result.projectId))
    return { ok: true, previous: result.previous }
  } catch (err) {
    return fail(err, 'stav etapy')
  }
}

export async function setPhaseDueDateAction(phaseId: string, dueDate: string | null): Promise<Result<{ previous: string | null }>> {
  await requireAuth()
  const idOk = uuid.safeParse(phaseId)
  if (!idOk.success) return { ok: false, error: 'Etapa nebyla nalezena.' }
  if (dueDate !== null && !isIsoDay(dueDate)) return { ok: false, error: 'Datum není platné.' }
  try {
    const result = await setPhaseDueDate(idOk.data, dueDate)
    if (!result) return { ok: false, error: 'Etapa nebyla nalezena. Možná ji mezitím někdo smazal.' }
    revalidatePath(projectPath(result.projectId))
    return { ok: true, previous: result.previous }
  } catch (err) {
    return fail(err, 'termín etapy')
  }
}
