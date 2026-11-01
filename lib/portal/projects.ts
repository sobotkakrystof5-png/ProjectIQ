import 'server-only'
import { portalDb } from './db'
import { STATUS_LABELS, type ProjectStatus } from '@/lib/types'
import type { ActivityKind } from '@/lib/project-activity'

// Čtení projekcí pro klienta (KP06). Vše přes portalDb(clientId) a RLS, navíc
// s výslovným filtrem client_id.

export interface PortalProject {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  statusLabel: string
  progress: number
  deadline: string | null
  projectUrl: string | null
  lastActivity: { title: string; publishedAt: string } | null
}

export interface PortalActivity {
  id: string
  kind: ActivityKind
  title: string
  body: string
  publishedAt: string
}

type ProjectRow = {
  id: string
  name: string
  description: string | null
  status: string
  progress: number
  deadline: string | null
  project_url: string | null
  last_title: string | null
  last_at: string | null
}

const isStatus = (v: string): v is ProjectStatus => v in STATUS_LABELS
const iso = (v: string | Date): string => new Date(v).toISOString()

function toProject(r: ProjectRow): PortalProject {
  const status: ProjectStatus = isStatus(r.status) ? r.status : 'new'
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    status,
    statusLabel: STATUS_LABELS[status],
    progress: r.progress,
    deadline: r.deadline ? iso(r.deadline) : null,
    projectUrl: r.project_url,
    lastActivity: r.last_title && r.last_at ? { title: r.last_title, publishedAt: iso(r.last_at) } : null,
  }
}

const SELECT = `
  SELECT p.id, p.name, p.description, p.status, p.progress, p.deadline, p.project_url,
         (SELECT a.title FROM portal.activity a WHERE a.client_id = p.client_id AND a.project_id = p.id ORDER BY a.published_at DESC LIMIT 1) AS last_title,
         (SELECT a.published_at FROM portal.activity a WHERE a.client_id = p.client_id AND a.project_id = p.id ORDER BY a.published_at DESC LIMIT 1) AS last_at
  FROM portal.projects p
`

export async function listClientProjects(clientId: string): Promise<PortalProject[]> {
  const db = portalDb({ clientId })
  const rows = await db<ProjectRow>`
    SELECT p.id, p.name, p.description, p.status, p.progress, p.deadline, p.project_url,
           (SELECT a.title FROM portal.activity a WHERE a.client_id = p.client_id AND a.project_id = p.id ORDER BY a.published_at DESC LIMIT 1) AS last_title,
           (SELECT a.published_at FROM portal.activity a WHERE a.client_id = p.client_id AND a.project_id = p.id ORDER BY a.published_at DESC LIMIT 1) AS last_at
    FROM portal.projects p
    WHERE p.client_id = ${clientId}
    ORDER BY p.updated_at DESC
  `
  return rows.map(toProject)
}

export async function loadClientProject(
  clientId: string,
  projectId: string,
): Promise<{ project: PortalProject; activity: PortalActivity[] } | null> {
  const db = portalDb({ clientId })
  const [projects, activity] = await db.batch([
    { text: `${SELECT} WHERE p.client_id = $1 AND p.id = $2`, params: [clientId, projectId] },
    {
      text: `SELECT id, kind, title, body, published_at FROM portal.activity
             WHERE client_id = $1 AND project_id = $2 ORDER BY published_at DESC LIMIT 100`,
      params: [clientId, projectId],
    },
  ])
  const row = projects[0] as ProjectRow | undefined
  if (!row) return null
  return {
    project: toProject(row),
    activity: (activity as { id: string; kind: ActivityKind; title: string; body: string; published_at: string }[]).map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      body: a.body,
      publishedAt: iso(a.published_at),
    })),
  }
}

export interface PortalRequest {
  id: string
  body: string
  status: 'new' | 'done' | 'dismissed'
  createdAt: string
}

export interface PortalMessage {
  id: string
  author: 'client' | 'admin'
  body: string
  createdAt: string
}

export const REQUEST_STATUS_LABELS: Record<PortalRequest['status'], string> = {
  new: 'Odesláno',
  done: 'Vyřízeno',
  dismissed: 'Uzavřeno',
}

/** Požadavky, zprávy a stav hodnocení jedné zakázky (KP07). */
export async function loadProjectExtras(
  clientId: string,
  projectId: string,
  memberId: string,
): Promise<{ requests: PortalRequest[]; messages: PortalMessage[]; rated: boolean }> {
  const db = portalDb({ clientId })
  const [requests, messages, feedback] = await db.batch([
    {
      text: `SELECT id, body, status, created_at FROM portal.requests
             WHERE client_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 20`,
      params: [clientId, projectId],
    },
    {
      text: `SELECT id, author, body, created_at FROM portal.messages
             WHERE client_id = $1 AND project_id = $2 ORDER BY created_at ASC LIMIT 200`,
      params: [clientId, projectId],
    },
    {
      text: `SELECT 1 FROM portal.feedback WHERE client_id = $1 AND project_id = $2 AND member_id = $3 LIMIT 1`,
      params: [clientId, projectId, memberId],
    },
  ])
  return {
    requests: (requests as { id: string; body: string; status: PortalRequest['status']; created_at: string }[]).map((r) => ({
      id: r.id,
      body: r.body,
      status: r.status,
      createdAt: iso(r.created_at),
    })),
    messages: (messages as { id: string; author: 'client' | 'admin'; body: string; created_at: string }[]).map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      createdAt: iso(m.created_at),
    })),
    rated: feedback.length > 0,
  }
}
