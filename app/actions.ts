'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getPublicUrl } from '@/lib/utils'
import { sendBrandedEmail, type EmailCta } from '@/lib/email'
import { STATUS_LABELS, type ProjectStatus } from '@/lib/types'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Neautorizovaný přístup')
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

type ProjectPayload = {
  client_name: string
  client_email: string | null
  client_phone: string | null
  service_type: string | null
  description: string | null
  focus: string | null
  project_url: string | null
  status: ProjectStatus
  progress: number
  price: number | null
  paid: boolean
  deadline: string | null
  notes: string | null
}

async function notifyClientOfProjectChange(
  project: {
    client_name: string
    client_email: string | null
    status: ProjectStatus
    progress: number
    project_url: string | null
    public_token: string
  },
  changeType: 'created' | 'updated'
) {
  if (!project.client_email) return
  const ctas: EmailCta[] = []
  if (project.project_url) ctas.push({ label: 'Zobrazit živou verzi', href: project.project_url })
  ctas.push({ label: 'Otevřít přehled projektu', href: getPublicUrl(project.public_token), primary: false })

  await sendBrandedEmail({
    to: project.client_email,
    subject: changeType === 'created' ? 'Váš projekt byl založen – ZakazIQ' : 'Aktualizace vašeho projektu – ZakazIQ',
    heading: changeType === 'created' ? 'Váš projekt byl založen' : 'Váš projekt byl aktualizován',
    intro: `Dobrý den, ${project.client_name}, právě jsme aktualizovali stav vašeho projektu.`,
    fields: [
      { label: 'Stav', value: STATUS_LABELS[project.status] },
      { label: 'Postup', value: `${project.progress}%` },
    ],
    ctas,
  })
}

export async function createProject(payload: ProjectPayload) {
  await requireAuth()
  const progress = clampProgress(payload.progress)
  const rows = await sql`
    INSERT INTO projects (client_name, client_email, client_phone, service_type, description, focus, project_url, status, progress, price, paid, deadline, notes)
    VALUES (
      ${payload.client_name},
      ${payload.client_email},
      ${payload.client_phone},
      ${payload.service_type},
      ${payload.description},
      ${payload.focus},
      ${payload.project_url},
      ${payload.status},
      ${progress},
      ${payload.price},
      ${payload.paid},
      ${payload.deadline},
      ${payload.notes}
    )
    RETURNING public_token
  `
  const publicToken = (rows[0] as { public_token: string }).public_token
  await notifyClientOfProjectChange(
    { client_name: payload.client_name, client_email: payload.client_email, status: payload.status, progress, project_url: payload.project_url, public_token: publicToken },
    'created'
  )
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function updateProject(
  id: string,
  payload: ProjectPayload,
  progressUpdate?: { from: number; description: string }
) {
  await requireAuth()
  const progress = clampProgress(payload.progress)
  const rows = await sql`
    UPDATE projects SET
      client_name = ${payload.client_name},
      client_email = ${payload.client_email},
      client_phone = ${payload.client_phone},
      service_type = ${payload.service_type},
      description = ${payload.description},
      focus = ${payload.focus},
      project_url = ${payload.project_url},
      status = ${payload.status},
      progress = ${progress},
      price = ${payload.price},
      paid = ${payload.paid},
      deadline = ${payload.deadline},
      notes = ${payload.notes},
      updated_at = now()
    WHERE id = ${id}
    RETURNING public_token
  `
  if (progressUpdate && progressUpdate.from !== progress) {
    await sql`
      INSERT INTO progress_updates (project_id, progress_from, progress_to, description)
      VALUES (${id}, ${progressUpdate.from}, ${progress}, ${progressUpdate.description})
    `
  }
  const publicToken = (rows[0] as { public_token: string }).public_token
  await notifyClientOfProjectChange(
    { client_name: payload.client_name, client_email: payload.client_email, status: payload.status, progress, project_url: payload.project_url, public_token: publicToken },
    'updated'
  )
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${id}`)
}

export async function deleteProject(id: string) {
  await requireAuth()
  await sql`DELETE FROM projects WHERE id = ${id}`
  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function addClientMessage(projectId: string, publicToken: string, content: string) {
  await requireAuth()
  if (!content.trim()) return
  await sql`INSERT INTO client_messages (project_id, content) VALUES (${projectId}, ${content.trim()})`
  revalidatePath(`/dashboard/${projectId}`)
  revalidatePath(`/p/${publicToken}`)
}

export async function deleteClientMessage(messageId: string, projectId: string, publicToken: string) {
  await requireAuth()
  await sql`DELETE FROM client_messages WHERE id = ${messageId} AND project_id = ${projectId}`
  revalidatePath(`/dashboard/${projectId}`)
  revalidatePath(`/p/${publicToken}`)
}
