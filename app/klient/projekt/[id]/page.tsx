import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, MessagesSquare } from 'lucide-react'
import { z } from 'zod'
import { requireClient } from '@/lib/portal/context'
import { loadClientProject } from '@/lib/portal/projects'
import { loadClientSurvey } from '@/lib/portal/survey'
import { SurveyCard } from '@/components/portal/survey-card'
import { loadProjectWebLeads } from '@/lib/portal/web-leads'
import { WebLeadsChart } from '@/components/client-web/web-leads-chart'
import { PhaseTimeline } from '@/components/portal/phase-timeline'
import { loadClientPhases } from '@/lib/portal/phases'
import { ProjectMoney } from '@/components/portal/project-money'
import { loadClientMoney } from '@/lib/portal/money'
import { ProjectConsultations } from '@/components/portal/consultations'
import { loadClientConsultations } from '@/lib/portal/consultations'
import { getPragueTodayISO } from '@/lib/prague-time'
import { ClientShell } from '@/components/portal/client-shell'
import { ACTIVITY_KIND_LABELS } from '@/lib/project-activity'
import { formatDate } from '@/lib/utils'
import { safeHttpUrl } from '@/lib/security/html'

export const metadata: Metadata = { title: 'Projekt' }

export default async function KlientProjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const ctx = await requireClient()
  const data = await loadClientProject(ctx.clientId, id)
  if (!data) notFound()
  const { project, activity } = data
  const [survey, phases, { money, invoices }, consultations, webLeads] = await Promise.all([
    loadClientSurvey(ctx.clientId, ctx.memberId, id),
    loadClientPhases(ctx.clientId, id),
    loadClientMoney(ctx.clientId, id),
    loadClientConsultations(ctx.clientId, id),
    loadProjectWebLeads(ctx.clientId, ctx.memberId, id),
  ])

  return (
    <ClientShell ctx={ctx} section="prehled" activeProjectId={null}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/klient" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-quiet hover:text-ink">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          Všechny projekty
        </Link>
        <Link
          href={`/klient/zpravy/${project.id}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-chip bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800"
        >
          <MessagesSquare size={16} strokeWidth={1.5} aria-hidden="true" />
          Zprávy k zakázce
        </Link>
      </div>

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
        {safeHttpUrl(project.projectUrl) && (
          <a
            href={safeHttpUrl(project.projectUrl)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-chip border border-navy-100 px-4 text-sm font-medium text-ink hover:border-navy-300"
          >
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
            Otevřít živou verzi
          </a>
        )}
      </section>

      {phases.length > 0 && <PhaseTimeline projectId={project.id} phases={phases} />}

      <ProjectMoney money={money} invoices={invoices} />

      {consultations.enabled && (
        <ProjectConsultations
          projectId={project.id}
          today={getPragueTodayISO()}
          upcoming={consultations.upcoming}
          freeSlots={consultations.freeSlots}
        />
      )}

      {webLeads && (
        <section className="mt-5 rounded-box border border-navy-100 bg-surface p-5" aria-labelledby="poptavky-z-webu">
          <h2 id="poptavky-z-webu" className="mb-3 text-base font-semibold text-ink">Poptávky z vašeho webu</h2>
          <WebLeadsChart stats={webLeads} />
        </section>
      )}

      {survey && <SurveyCard survey={survey} />}

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

      <p className="mt-8 rounded-box border border-navy-100 bg-surface p-5 text-sm text-quiet">
        Požadavky, zpětnou vazbu i dotazy teď pište do{' '}
        <Link href={`/klient/zpravy/${project.id}`} className="font-semibold text-navy-700 hover:underline">zpráv k zakázce</Link>
        . Můžete je i nadiktovat nebo přidat screenshot.
      </p>
      </div>
      </div>
    </ClientShell>
  )
}
