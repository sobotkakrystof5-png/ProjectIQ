'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { getAdminSession, requireAuth } from '@/lib/auth'
import { projectPath, toBusiness } from '@/lib/business'
import { sendActivityDigestEmail } from '@/lib/email'
import { getPublicUrl } from '@/lib/utils'
import {
  ACTIVITY_KIND_LABELS,
  activityInputSchema,
  prepareActivity,
  type ActivityKind,
  type ActivityInput,
} from '@/lib/project-activity'

// Aktivita zakázky (KP03): koncepty, schvalování a souhrnný e-mail klientovi.
// Každá akce začíná requireAuth(). Klient vidí jen řádky se stavem `published`
// (viz app/p/[token]/page.tsx), nikdy koncepty ani zdroj.

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

const idSchema = z.string().uuid()
const NOT_FOUND = 'Zpráva nebyla nalezena nebo už není koncept.'

async function adminEmail(): Promise<string> {
  const session = await getAdminSession()
  return session?.user?.email ?? 'admin'
}

interface ProjectRef {
  id: string
  business: string
  public_token: string
  client_name: string
  client_email: string | null
}

async function loadProject(projectId: string): Promise<ProjectRef | null> {
  const rows = await sql`
    SELECT id, business, public_token, client_name, client_email FROM projects WHERE id = ${projectId} LIMIT 1
  `
  return (rows[0] as ProjectRef | undefined) ?? null
}

async function projectOfActivity(activityId: string): Promise<ProjectRef | null> {
  const rows = await sql`
    SELECT p.id, p.business, p.public_token, p.client_name, p.client_email
    FROM project_activity a JOIN projects p ON p.id = a.project_id
    WHERE a.id = ${activityId} LIMIT 1
  `
  return (rows[0] as ProjectRef | undefined) ?? null
}

function revalidateProject(project: ProjectRef): void {
  revalidatePath(projectPath(toBusiness(project.business), project.id))
  revalidatePath(`/p/${project.public_token}`)
  revalidatePath('/dashboard')
}

/**
 * Souhrnný e-mail klientovi: nejvýš jednou za 24 hodin a jen o zprávách, které
 * ještě v e-mailu nebyly. Řádky se „zabrat“ jedním příkazem (souběžné schválení
 * neodešle e-mail dvakrát); když odeslání selže, značka se vrátí. Selhání nikdy
 * nezruší publikaci.
 */
async function sendDigestIfDue(project: ProjectRef): Promise<void> {
  if (!project.client_email) return
  let claimed: { id: string; kind: ActivityKind; title: string }[] = []
  try {
    claimed = (await sql`
      UPDATE project_activity SET client_emailed_at = now()
      WHERE project_id = ${project.id} AND status = 'published' AND client_emailed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM project_activity
          WHERE project_id = ${project.id} AND client_emailed_at > now() - interval '24 hours'
        )
      RETURNING id, kind, title
    `) as typeof claimed
    if (!claimed.length) return
    const sent = await sendActivityDigestEmail({
      to: project.client_email,
      clientName: project.client_name,
      items: claimed.map((row) => ({ label: ACTIVITY_KIND_LABELS[row.kind], title: row.title })),
      portalUrl: getPublicUrl(project.public_token),
      business: toBusiness(project.business),
    })
    if (!sent) await releaseClaim(claimed.map((row) => row.id))
  } catch (err) {
    console.error('[activity] souhrnný e-mail selhal:', err instanceof Error ? err.name : 'unknown')
    if (claimed.length) await releaseClaim(claimed.map((row) => row.id))
  }
}

async function releaseClaim(ids: string[]): Promise<void> {
  try {
    await sql`UPDATE project_activity SET client_emailed_at = NULL WHERE id = ANY(${ids}::uuid[])`
  } catch (err) {
    console.error('[activity] vrácení značky e-mailu selhalo:', err instanceof Error ? err.name : 'unknown')
  }
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Neplatná data.'
}

export async function createActivityDraft(projectId: string, input: ActivityInput): Promise<Result<{ id: string }>> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  const parsed = activityInputSchema.safeParse(input)
  if (!id.success) return { success: false, error: 'Neplatná zakázka.' }
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }
  const project = await loadProject(id.data)
  if (!project) return { success: false, error: 'Zakázka nebyla nalezena.' }

  const prepared = prepareActivity(parsed.data)
  const rows = await sql`
    INSERT INTO project_activity (project_id, status, source, kind, title, body, contains_sensitive)
    VALUES (${project.id}, 'draft', 'manual', ${prepared.kind}, ${prepared.title}, ${prepared.body}, ${prepared.containsSensitive})
    RETURNING id
  `
  revalidateProject(project)
  return { success: true, id: String((rows[0] as { id: string }).id) }
}

export async function updateActivity(activityId: string, input: ActivityInput): Promise<Result<{ containsSensitive: boolean }>> {
  await requireAuth()
  const id = idSchema.safeParse(activityId)
  const parsed = activityInputSchema.safeParse(input)
  if (!id.success) return { success: false, error: 'Neplatná zpráva.' }
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) }

  const prepared = prepareActivity(parsed.data)
  const rows = await sql`
    UPDATE project_activity
    SET kind = ${prepared.kind}, title = ${prepared.title}, body = ${prepared.body},
        contains_sensitive = ${prepared.containsSensitive}, updated_at = now()
    WHERE id = ${id.data} AND status = 'draft'
    RETURNING id
  `
  if (!rows.length) return { success: false, error: NOT_FOUND }
  const project = await projectOfActivity(id.data)
  if (project) revalidateProject(project)
  return { success: true, containsSensitive: prepared.containsSensitive }
}

export async function approveActivity(activityId: string): Promise<Result> {
  await requireAuth()
  const id = idSchema.safeParse(activityId)
  if (!id.success) return { success: false, error: 'Neplatná zpráva.' }
  const by = await adminEmail()

  const rows = await sql`
    UPDATE project_activity
    SET status = 'published', published_at = now(), published_by = ${by}, updated_at = now()
    WHERE id = ${id.data} AND status = 'draft' AND NOT contains_sensitive
    RETURNING id
  `
  if (!rows.length) {
    const existing = await sql`SELECT status, contains_sensitive FROM project_activity WHERE id = ${id.data}`
    const row = existing[0] as { status: string; contains_sensitive: boolean } | undefined
    if (row?.status === 'draft' && row.contains_sensitive) {
      return { success: false, error: 'Zpráva obsahuje něco, co vypadá jako tajný údaj. Upravte ji a odstraňte značku [skryto].' }
    }
    return { success: false, error: NOT_FOUND }
  }
  const project = await projectOfActivity(id.data)
  if (project) {
    revalidateProject(project)
    await sendDigestIfDue(project)
  }
  return { success: true }
}

/** Schválí všechny koncepty zakázky bez citlivých údajů; citlivé nechá na úpravu. */
export async function approveAllDrafts(projectId: string): Promise<Result<{ approved: number; skipped: number }>> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  if (!id.success) return { success: false, error: 'Neplatná zakázka.' }
  const project = await loadProject(id.data)
  if (!project) return { success: false, error: 'Zakázka nebyla nalezena.' }
  const by = await adminEmail()

  const published = await sql`
    UPDATE project_activity
    SET status = 'published', published_at = now(), published_by = ${by}, updated_at = now()
    WHERE project_id = ${project.id} AND status = 'draft' AND NOT contains_sensitive
    RETURNING id
  `
  const left = await sql`
    SELECT count(*)::int AS count FROM project_activity
    WHERE project_id = ${project.id} AND status = 'draft'
  `
  revalidateProject(project)
  if (published.length) await sendDigestIfDue(project)
  return { success: true, approved: published.length, skipped: (left[0] as { count: number }).count }
}

export async function rejectActivity(activityId: string): Promise<Result> {
  await requireAuth()
  const id = idSchema.safeParse(activityId)
  if (!id.success) return { success: false, error: 'Neplatná zpráva.' }
  const rows = await sql`
    UPDATE project_activity SET status = 'rejected', updated_at = now()
    WHERE id = ${id.data} AND status = 'draft' RETURNING id
  `
  if (!rows.length) return { success: false, error: NOT_FOUND }
  const project = await projectOfActivity(id.data)
  if (project) revalidateProject(project)
  return { success: true }
}

/** „Zpět“ po zamítnutí: zamítnutá zpráva se vrátí mezi koncepty. */
export async function reopenActivity(activityId: string): Promise<Result> {
  await requireAuth()
  const id = idSchema.safeParse(activityId)
  if (!id.success) return { success: false, error: 'Neplatná zpráva.' }
  const rows = await sql`
    UPDATE project_activity SET status = 'draft', updated_at = now()
    WHERE id = ${id.data} AND status = 'rejected' RETURNING id
  `
  if (!rows.length) return { success: false, error: 'Zpráva nebyla zamítnutá.' }
  const project = await projectOfActivity(id.data)
  if (project) revalidateProject(project)
  return { success: true }
}
