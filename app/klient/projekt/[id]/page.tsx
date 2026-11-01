import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { z } from 'zod'
import { requireClient } from '@/lib/portal/context'
import { loadClientProject, loadProjectExtras, REQUEST_STATUS_LABELS } from '@/lib/portal/projects'
import { ClientRequestBlock } from '@/components/ClientRequestBlock'
import { FeedbackCard } from '@/components/portal/feedback-card'
import { MessageThread } from '@/components/portal/message-thread'
import { isTranscriptionConfigured } from '@/lib/transcribe'
import { sendRequest } from './actions'
import { PortalFrame } from '@/components/portal/portal-frame'
import { ACTIVITY_KIND_LABELS } from '@/lib/project-activity'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Projekt' }

export default async function KlientProjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const ctx = await requireClient()
  const data = await loadClientProject(ctx.clientId, id)
  if (!data) notFound()
  const { project, activity } = data
  const { requests, messages, rated } = await loadProjectExtras(ctx.clientId, id, ctx.memberId)
  const isDone = project.status === 'done' || project.status === 'paid'

  return (
    <PortalFrame clientName={ctx.clientName}>
      <Link href="/klient" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-quiet hover:text-ink">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        Všechny projekty
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{project.name}</h1>
        <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">{project.statusLabel}</span>
      </div>
      {project.description && <p className="mt-1 text-sm text-quiet">{project.description}</p>}

      <section className="mt-5 rounded-box border border-navy-100 bg-surface p-5">
        <div role="progressbar" aria-valuenow={project.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Postup projektu">
          <div className="h-2 overflow-hidden rounded-full bg-navy-50">
            <div className="h-full rounded-full bg-navy-700" style={{ width: `${project.progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-quiet">Hotovo {project.progress} %{project.deadline ? ` · termín ${formatDate(project.deadline)}` : ''}</p>
        </div>
        {project.projectUrl && (
          <a
            href={project.projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-chip border border-navy-100 px-4 text-sm font-medium text-ink hover:border-navy-300"
          >
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
            Otevřít živou verzi
          </a>
        )}
      </section>

      {isDone && !rated && (
        <div className="mt-5">
          <FeedbackCard projectId={project.id} />
        </div>
      )}

      <section className="mt-5" aria-labelledby="co-se-delo">
        <h2 id="co-se-delo" className="mb-3 text-sm font-semibold uppercase tracking-wider text-quiet">Co se dělo</h2>
        {activity.length === 0 ? (
          <p className="rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">
            Zatím tu nic není. Jakmile něco dokončíme, napíšeme vám to sem.
          </p>
        ) : (
          <ul className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="rounded-box border border-navy-100 bg-surface p-5">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">{ACTIVITY_KIND_LABELS[a.kind]}</span>
                  <span className="text-xs text-quiet">{formatDate(a.publishedAt)}</span>
                </div>
                <p className="font-medium text-ink">{a.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="pozadavky">
        <h2 id="pozadavky" className="mb-3 text-sm font-semibold uppercase tracking-wider text-quiet">Máte požadavek nebo změnu?</h2>
        <div className="rounded-box border border-navy-100 bg-surface p-5">
          <ClientRequestBlock
            submit={sendRequest.bind(null, project.id)}
            transcribeUrl="/api/klient/transcribe"
            voiceEnabled={isTranscriptionConfigured()}
          />
          {requests.length > 0 && (
            <ul className="mt-5 space-y-2 border-t border-navy-100 pt-4">
              {requests.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-ink">{r.body}</span>
                    <span className="text-xs text-quiet">{formatDate(r.createdAt)}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">
                    {REQUEST_STATUS_LABELS[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="zpravy">
        <h2 id="zpravy" className="mb-3 text-sm font-semibold uppercase tracking-wider text-quiet">Zprávy</h2>
        <div className="rounded-box border border-navy-100 bg-surface p-5">
          <MessageThread projectId={project.id} messages={messages} />
        </div>
      </section>
    </PortalFrame>
  )
}
