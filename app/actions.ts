'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { getPublicUrl } from '@/lib/utils'
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
  description: string | null
  focus: string | null
  project_url: string | null
  status: ProjectStatus
  progress: number
  price: number | null
  paid: boolean
  deadline: string | null
  notes: string | null
  client_email: string | null
}

function buildProjectUpdateEmail(opts: {
  clientName: string
  statusLabel: string
  progress: number
  portalUrl: string
  projectUrl: string | null
  changeType: 'created' | 'updated'
}): string {
  const heading = opts.changeType === 'created' ? 'Váš projekt byl založen' : 'Váš projekt byl aktualizován'
  const liveLinkButton = opts.projectUrl
    ? `<a href="${opts.projectUrl}" style="display:inline-block;background:linear-gradient(135deg,#1b3868,#23478b);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;margin-right:12px;">Zobrazit živou verzi →</a>`
    : ''
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:linear-gradient(135deg,#1b3868 0%,#23478b 100%);padding:32px 40px;">
    <p style="margin:0 0 6px;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">ZakazIQ</p>
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${heading}</h1>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      Dobrý den, ${opts.clientName}, právě jsme aktualizovali stav vašeho projektu.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e0e7ff;border-radius:12px;margin-bottom:24px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Stav</p>
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">${opts.statusLabel}</p>
      <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Postup</p>
      <p style="margin:0;font-size:16px;font-weight:600;color:#111827;">${opts.progress}%</p>
    </td></tr></table>
    ${liveLinkButton}<a href="${opts.portalUrl}" style="display:inline-block;background:#fff;color:#1b3868;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid #c7d2fe;">Otevřít přehled projektu →</a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Vygenerováno automaticky — ZakazIQ</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
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
  try {
    const gmailUser = process.env.GMAIL_USER
    const gmailPassword = process.env.GMAIL_APP_PASSWORD
    if (!gmailUser || !gmailPassword) return
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPassword.replace(/\s/g, '') },
    })
    await transporter.sendMail({
      from: `ZakazIQ <${gmailUser}>`,
      to: project.client_email,
      subject: changeType === 'created' ? 'Váš projekt byl založen – ZakazIQ' : 'Aktualizace vašeho projektu – ZakazIQ',
      html: buildProjectUpdateEmail({
        clientName: project.client_name,
        statusLabel: STATUS_LABELS[project.status],
        progress: project.progress,
        portalUrl: getPublicUrl(project.public_token),
        projectUrl: project.project_url,
        changeType,
      }),
    })
  } catch (err) {
    console.error('[Email] Selhání odesílání emailu o změně projektu:', err)
  }
}

export async function createProject(payload: ProjectPayload) {
  await requireAuth()
  const progress = clampProgress(payload.progress)
  const rows = await sql`
    INSERT INTO projects (client_name, description, focus, project_url, status, progress, price, paid, deadline, notes, client_email)
    VALUES (
      ${payload.client_name},
      ${payload.description},
      ${payload.focus},
      ${payload.project_url},
      ${payload.status},
      ${progress},
      ${payload.price},
      ${payload.paid},
      ${payload.deadline},
      ${payload.notes},
      ${payload.client_email}
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
      description = ${payload.description},
      focus = ${payload.focus},
      project_url = ${payload.project_url},
      status = ${payload.status},
      progress = ${progress},
      price = ${payload.price},
      paid = ${payload.paid},
      deadline = ${payload.deadline},
      notes = ${payload.notes},
      client_email = ${payload.client_email},
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
