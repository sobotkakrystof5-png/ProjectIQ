import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/utils'
import { Calendar, RefreshCw, MessageSquare, TrendingUp } from 'lucide-react'
import type { Project, ProjectStatus, ClientMessage, ProgressUpdate } from '@/lib/types'

interface PageProps {
  params: { token: string }
}

export default async function ClientPortalPage({ params }: PageProps) {
  const rows = await sql`
    SELECT id, client_name, description, focus, status, progress, deadline, updated_at
    FROM projects
    WHERE public_token = ${params.token}
    LIMIT 1
  `

  if (!rows.length) notFound()
  const project = rows[0] as Pick<Project, 'id' | 'client_name' | 'description' | 'focus' | 'status' | 'progress' | 'deadline' | 'updated_at'>

  const [msgRows, progressRows] = await Promise.all([
    sql`SELECT id, content, created_at FROM client_messages WHERE project_id = ${project.id} ORDER BY created_at DESC`,
    sql`SELECT id, progress_from, progress_to, description, created_at FROM progress_updates WHERE project_id = ${project.id} ORDER BY created_at DESC`,
  ])
  const messages = msgRows as Pick<ClientMessage, 'id' | 'content' | 'created_at'>[]
  const progressUpdates = progressRows as Pick<ProgressUpdate, 'id' | 'progress_from' | 'progress_to' | 'description' | 'created_at'>[]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">

            {/* Brand header */}
            <div className="brand-gradient px-6 pt-7 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-brand-200 uppercase tracking-wider mb-1.5">Projekt pro</p>
                  <h1 className="text-2xl font-semibold text-white">{project.client_name}</h1>
                  {project.description && (
                    <p className="text-sm text-brand-100 mt-1.5 leading-relaxed">{project.description}</p>
                  )}
                </div>
                <div className="shrink-0 mt-0.5">
                  <StatusBadge status={project.status as ProjectStatus} />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-6 space-y-6">
              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Postup prací</span>
                  <span className="text-sm font-bold text-brand-800">{project.progress}%</span>
                </div>
                <div className="h-2.5 bg-brand-50 rounded-full overflow-hidden border border-brand-100">
                  <div
                    className="h-full rounded-full brand-gradient transition-all duration-700"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* Focus */}
              {project.focus && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">O projektu</p>
                  <p className="text-sm text-foreground leading-relaxed">{project.focus}</p>
                </div>
              )}

              {/* Progress updates timeline */}
              {progressUpdates.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={13} strokeWidth={1.5} className="text-brand-500" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historie postupu</p>
                  </div>
                  <ul className="space-y-3">
                    {progressUpdates.map((u, i) => (
                      <li key={u.id} className="relative flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" />
                          {i < progressUpdates.length - 1 && (
                            <div className="w-px flex-1 bg-brand-100 mt-1" />
                          )}
                        </div>
                        <div className="pb-3 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
                              {u.progress_from}% → {u.progress_to}%
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(new Date(u.created_at as string).toISOString().split('T')[0])}</span>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{u.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Client messages */}
              {messages.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare size={13} strokeWidth={1.5} className="text-brand-500" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vzkazy od freelancera</p>
                  </div>
                  <ul className="space-y-2.5">
                    {messages.map(msg => (
                      <li key={msg.id} className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {formatDate(new Date(msg.created_at).toISOString().split('T')[0])}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Meta */}
              <div className="flex flex-wrap gap-4 pt-4 border-t border-border">
                {project.deadline && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar size={14} strokeWidth={1.5} className="text-brand-500" />
                    <span>Deadline: <strong className="text-foreground font-medium">{formatDate(project.deadline)}</strong></span>
                  </div>
                )}
                {project.updated_at && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <RefreshCw size={14} strokeWidth={1.5} className="text-brand-500" />
                    <span>Aktualizováno: <strong className="text-foreground font-medium">{formatDate(new Date(project.updated_at as string).toISOString().split('T')[0])}</strong></span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 mt-6">
            <div className="w-5 h-5 brand-gradient rounded-md flex items-center justify-center shadow-sm">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
                <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
              </svg>
            </div>
            <span className="text-xs text-muted-foreground">Powered by <span className="font-semibold text-brand-800">ProjectIQ</span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
