import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ExternalLink, Layers } from 'lucide-react'
import { sql } from '@/lib/db'
import { ProjectForm } from '@/components/ProjectForm'
import { ShareButton } from '@/components/ShareButton'
import { QRCodeDisplay } from '@/components/QRCodeDisplay'
import { StatusBadge } from '@/components/StatusBadge'
import { ClientMessagesEditor } from '@/components/ClientMessagesEditor'
import { FeedbackFeed } from '@/components/FeedbackFeed'
import { ConsultationCalendar } from '@/components/ConsultationCalendar'
import { ProjectNotesPanel } from '@/components/ProjectNotesPanel'
import { DeleteButton } from '@/components/DeleteButton'
import { MarkCompletedButton } from '@/components/MarkCompletedButton'
import { InvoiceArchive } from '@/components/InvoiceArchive'
import CostsManager from '@/components/CostsManager'
import { getProjectInvoices } from '@/app/hub/finance/invoice-actions'
import { getProjectCosts } from '@/app/costs-actions'
import { getPublicUrl, formatDate } from '@/lib/utils'
import { toBusiness, projectPath } from '@/lib/business'
import type { Project, ProjectStatus, ClientMessage, ProgressUpdate, ClientFeedback, ConsultationSlot, ProjectNote } from '@/lib/types'

interface PageProps {
  params: { id: string }
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const [rows, msgRows, progressRows, feedbackRows, slotRows, noteRows, blockCountRows] = await Promise.all([
    sql`SELECT * FROM projects WHERE id = ${params.id} LIMIT 1`,
    sql`SELECT * FROM client_messages WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM progress_updates WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM client_feedback WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM consultation_slots WHERE project_id = ${params.id} ORDER BY scheduled_at DESC`,
    sql`SELECT * FROM project_notes WHERE project_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT count(*)::int AS count FROM project_blocks WHERE project_id = ${params.id}`,
  ])

  if (!rows.length) notFound()
  const project = rows[0] as Project & { business?: string }
  // ALTENO zakázka se edituje ve své sekci — jinak by se ukládala s VIZEON
  // revalidací a nabízela "Přidat do dokončených", což ALTENO nemá.
  if (toBusiness(project.business) !== 'vizeon') redirect(projectPath(toBusiness(project.business), params.id))

  const messages = msgRows as ClientMessage[]
  const progressUpdates = progressRows as ProgressUpdate[]
  const feedbacks = feedbackRows as ClientFeedback[]
  const slots = slotRows as ConsultationSlot[]
  const projectNotes = noteRows as ProjectNote[]
  const blockCount = (blockCountRows[0] as { count: number }).count
  const publicUrl = getPublicUrl(project.public_token)
  const [invoices, projectCosts] = await Promise.all([
    getProjectInvoices(project.id),
    getProjectCosts(project.id),
  ])

  return (
    <div>
      <div className="max-w-2xl flex items-start justify-between gap-4 mb-8">
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
        {project.project_url && (
          <a
            href={project.project_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-colors shrink-0"
          >
            <ExternalLink size={14} strokeWidth={1.5} />
            Živá verze
          </a>
        )}
      </div>

      <div className="max-w-2xl space-y-4">
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

        <Link
          href={`/dashboard/${project.id}/sablona`}
          className="flex items-center justify-between gap-3 bg-white border border-border rounded-2xl p-6 shadow-sm hover:border-brand-300 hover:bg-brand-50/40 transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <Layers size={16} strokeWidth={1.5} className="text-brand-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Šablona webu</h2>
              <p className="text-xs text-muted-foreground">
                {blockCount > 0 ? `${blockCount} ${blockCount === 1 ? 'blok' : blockCount < 5 ? 'bloky' : 'bloků'}` : 'Zatím žádné bloky'}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-brand-700 group-hover:text-brand-800 shrink-0">
            Otevřít
            <ArrowRight size={14} strokeWidth={1.5} />
          </span>
        </Link>

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

        {/* ── Faktury ── */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <InvoiceArchive
            data={invoices}
            defaults={{
              project_id: project.id,
              client_name: project.client_name,
              amount: project.price !== null ? String(project.price) : '',
            }}
            title="Faktury zakázky"
            description="Doklady k téhle zakázce. Zaplacená faktura založí příjem v přiznané linii."
            paidLabel="Zaplacené"
          />
        </div>

        {/* ── Náklady zakázky ── */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Náklady zakázky</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Skutečné náklady — promítají se do cash flow ve Financích. Odhad v editaci zakázky je jen orientační.
          </p>
          <CostsManager initialCosts={projectCosts} projectId={project.id} />
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Přidat do dokončených</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Přidá záznam do sekce Dokončené zakázky a zahrne ji do kalkulačky výdělků. Zakázka zůstane i v aktivním přehledu.
          </p>
          <MarkCompletedButton
            projectId={project.id}
            projectName={project.client_name}
            hasEstimatedCosts={project.estimated_costs != null && Number(project.estimated_costs) > 0}
          />
        </div>
      </div>

      {/* ── Poznámky ze schůzek a hovorů — vlastní široký panel ── */}
      <div className="mt-4 bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Poznámky ze schůzek a hovorů</h2>
        <p className="text-xs text-muted-foreground mb-5">Jen pro tebe — klient je nikdy neuvidí. Stav zakázky se sem jen zrcadlí, měníš ho v Editaci zakázky výše.</p>
        <ProjectNotesPanel projectId={project.id} initialNotes={projectNotes} currentProgress={project.progress} />
      </div>

      <div className="max-w-2xl mt-4 bg-white border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nebezpečná zóna</h2>
        <p className="text-xs text-muted-foreground mb-4">Smazání zakázky je nevratné.</p>
        <DeleteButton projectId={project.id} />
      </div>
    </div>
  )
}
