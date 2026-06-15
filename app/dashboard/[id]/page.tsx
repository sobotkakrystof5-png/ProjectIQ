import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { sql } from '@/lib/db'
import { ProjectForm } from '@/components/ProjectForm'
import { ShareButton } from '@/components/ShareButton'
import { QRCodeDisplay } from '@/components/QRCodeDisplay'
import { StatusBadge } from '@/components/StatusBadge'
import { ClientMessagesEditor } from '@/components/ClientMessagesEditor'
import { FeedbackFeed } from '@/components/FeedbackFeed'
import { ConsultationCalendar } from '@/components/ConsultationCalendar'
import { DeleteButton } from './DeleteButton'
import { getPublicUrl, formatDate } from '@/lib/utils'
import type { Project, ProjectStatus, ClientMessage, ProgressUpdate, ClientFeedback, ConsultationSlot } from '@/lib/types'

interface PageProps {
  params: { id: string }
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const [rows, msgRows, progressRows, feedbackRows, slotRows] = await Promise.all([
    sql`SELECT * FROM projects WHERE id = ${params.id} LIMIT 1`,
    sql`SELECT * FROM client_messages WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM progress_updates WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM client_feedback WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM consultation_slots WHERE project_id = ${params.id} ORDER BY scheduled_at DESC`,
  ])

  if (!rows.length) notFound()
  const project = rows[0] as Project
  const messages = msgRows as ClientMessage[]
  const progressUpdates = progressRows as ProgressUpdate[]
  const feedbacks = feedbackRows as ClientFeedback[]
  const slots = slotRows as ConsultationSlot[]
  const publicUrl = getPublicUrl(project.public_token)

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-brand-800 hover:bg-brand-50 transition-colors"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">{project.client_name}</h1>
              <StatusBadge status={project.status as ProjectStatus} />
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">Editace zakázky</h2>
          <ProjectForm project={project} />
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-5">Sdílet s klientem</h2>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <QRCodeDisplay url={publicUrl} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground mb-3">
                Pošli klientovi odkaz — bez registrace uvidí aktuální stav zakázky.
              </p>
              <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 mb-3">
                <span className="text-xs text-brand-600 flex-1 truncate font-mono">{publicUrl}</span>
              </div>
              <ShareButton token={project.public_token} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Vzkazy pro klienta</h2>
          <p className="text-xs text-muted-foreground mb-5">Klient je uvidí na svém přehledu. Interní poznámky v editaci zakázky klient nevidí.</p>
          <ClientMessagesEditor
            projectId={project.id}
            publicToken={project.public_token}
            messages={messages}
          />
        </div>

        {progressUpdates.length > 0 && (
          <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Historie postupu</h2>
            <p className="text-xs text-muted-foreground mb-5">Vidí i klient na svém přehledu.</p>
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
                      <span className="text-xs text-muted-foreground">{formatDate(u.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{u.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Feedback feed ── */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Zpětná vazba klienta
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            NPS hodnocení a poznámky odeslané klientem přes klientský portál.
          </p>
          <FeedbackFeed feedbacks={feedbacks} clientName={project.client_name} />
        </div>

        {/* ── Consultation calendar ── */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Konzultace
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            Termíny rezervované klientem. Kliknutím zobrazíš detail a odkaz na hovor.
          </p>
          <ConsultationCalendar slots={slots} clientName={project.client_name} />
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nebezpečná zóna</h2>
          <p className="text-xs text-muted-foreground mb-4">Smazání zakázky je nevratné.</p>
          <DeleteButton projectId={project.id} />
        </div>
      </div>
    </div>
  )
}
