import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import { requireClient } from '@/lib/portal/context'
import { loadClientProject } from '@/lib/portal/projects'
import { loadClientThread } from '@/lib/portal/chat'
import { currentPhase, loadClientPhases } from '@/lib/portal/phases'
import { loadClientMoney } from '@/lib/portal/money'
import { loadClientConsultations } from '@/lib/portal/consultations'
import { isTranscriptionConfigured } from '@/lib/transcribe'
import { ClientShell } from '@/components/portal/client-shell'
import { ProjectAside } from '@/components/portal/project-aside'
import { loadProjectWebLeads } from '@/lib/portal/web-leads'
import { AsideSheet } from '@/components/portal/aside-sheet'
import { getPragueTodayISO } from '@/lib/prague-time'
import { ChatThread } from '@/components/chat/chat-thread'
import { answerApproval } from '../actions'

export const metadata: Metadata = { title: 'Zprávy' }

// Chat u zakázky (KP15, R-122, R-123). Uprostřed vlákno, vpravo panel
// O zakázce (od 1280 px; užší obrazovka ho otevře tlačítkem v záhlaví).
export default async function KlientChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const ctx = await requireClient()
  const data = await loadClientProject(ctx.clientId, id)
  if (!data) notFound()
  const [thread, phases, { money, invoices }, consultations, webLeads] = await Promise.all([
    loadClientThread(ctx.clientId, id),
    loadClientPhases(ctx.clientId, id),
    loadClientMoney(ctx.clientId, id),
    loadClientConsultations(ctx.clientId, id),
    loadProjectWebLeads(ctx.clientId, ctx.memberId, id),
  ])
  const current = currentPhase(phases)
  const aside = (
    <ProjectAside
      project={data.project}
      phases={phases}
      money={money}
      invoices={invoices}
      consultations={consultations.upcoming}
      activity={data.activity}
      webLeads={webLeads}
      today={getPragueTodayISO()}
    />
  )

  return (
    <ClientShell ctx={ctx} section="zpravy" activeProjectId={id} fullScreenOnPhone>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col bg-ground" aria-label={`Zprávy k zakázce ${data.project.name}`}>
          <header className="flex items-center gap-2 border-b border-navy-100 bg-surface px-2 py-2 sm:px-4">
            <Link href="/klient/zpravy" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 md:hidden" aria-label="Zpět na zprávy">
              <ArrowLeft size={20} strokeWidth={1.5} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-ink">{data.project.name}</h1>
              <p className="truncate text-xs text-quiet">{current ? current.name : data.project.statusLabel}</p>
            </div>
            <AsideSheet projectName={data.project.name}>{aside}</AsideSheet>
          </header>
          <ChatThread
            viewer="client"
            projectId={id}
            messages={thread.messages}
            reads={thread.reads}
            sendUrl="/api/klient/zpravy"
            attachmentBase="/api/klient/prilohy"
            transcribeUrl={isTranscriptionConfigured() ? '/api/klient/transcribe' : null}
            otherName="Kryštof Sobotka"
            onAnswerApproval={answerApproval}
          />
        </section>
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-navy-100 bg-surface xl:block" aria-label="O zakázce">
          {aside}
        </aside>
      </div>
    </ClientShell>
  )
}
