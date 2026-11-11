import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
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
import { ClientRequestCard, type ClientRequestCardData } from '@/components/ClientRequestCard'
import { ProjectActivityPanel } from '@/components/ProjectActivityPanel'
import { AgentKeyPanel } from '@/components/AgentKeyPanel'
import { PortalReplyPanel, type PortalThreadMessage } from '@/components/admin/portal-reply-panel'
import { getProjectInvoices } from '@/app/hub/finance/invoice-actions'
import { getProjectCosts } from '@/app/costs-actions'
import { getActiveAgentKey, isAgentKeyConfigured, maskAgentKey } from '@/lib/agent-keys'
import { buildAgentEnvBlock, buildClaudeMdBlock } from '@/lib/agent-setup'
import { loadProjectActivity } from '@/lib/project-activity-queries'
import { buildTerminalCommand } from '@/lib/claude-code-handoff'
import { buildClaudeCodePrompt, type ClientRequestRow } from '@/lib/client-requests'
import { BUSINESSES, projectPath, toBusiness, type Business } from '@/lib/business'
import { formatDate, getPublicUrl, cn } from '@/lib/utils'
import type {
  Project, ProjectStatus, ClientMessage, ProgressUpdate, ClientFeedback, ConsultationSlot, ProjectNote,
} from '@/lib/types'

// Detail zakázky jako centrum (KP02): jedno místo se záložkami pro VIZEON i ALTENO.
// Záložka je v adrese (?zalozka=), takže jde sdílet a vrátit se tlačítkem Zpět;
// načítají se jen data aktivní záložky. Logika ukládání je beze změny (ProjectForm,
// app/actions.ts).

export const DETAIL_TABS = ['prehled', 'aktivita', 'pozadavky', 'zpravy', 'fakturace'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]

const TAB_LABELS: Record<DetailTab, string> = {
  prehled: 'Přehled',
  aktivita: 'Aktivita',
  pozadavky: 'Požadavky',
  zpravy: 'Zprávy',
  fakturace: 'Fakturace',
}

export function parseTab(value: string | undefined, business: Business): DetailTab {
  const tab = DETAIL_TABS.find((t) => t === value) ?? 'prehled'
  // Fakturace (faktury, náklady) je jen u VIZEON.
  return tab === 'fakturace' && business !== 'vizeon' ? 'prehled' : tab
}

const card = 'rounded-2xl border border-border bg-white p-6 shadow-sm'
const h2 = 'mb-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground'

async function appBaseUrl(): Promise<string> {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export async function ProjectDetailView({
  projectId,
  expectedBusiness,
  tabParam,
}: {
  projectId: string
  expectedBusiness: Business
  tabParam: string | undefined
}) {
  const rows = await sql`SELECT * FROM projects WHERE id = ${projectId} LIMIT 1`
  if (!rows.length) notFound()
  const project = rows[0] as Project & { business?: string }
  const business = toBusiness(project.business)
  // Starší odkazy (notifikace, e-maily) mířily do druhé sekce: pošli uživatele tam, kam zakázka patří.
  if (business !== expectedBusiness) redirect(projectPath(business, projectId))

  const tab = parseTab(tabParam, business)
  const base = projectPath(business, projectId)
  const tabs = DETAIL_TABS.filter((t) => t !== 'fakturace' || business === 'vizeon')

  const openRequests = await countOpenRequests(projectId)

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/zakazky"
            aria-label="Zpět na zakázky"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            <ArrowLeft size={18} strokeWidth={1.5} />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.client_name}</h1>
              <StatusBadge status={project.status as ProjectStatus} />
              <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                {BUSINESSES[business].label}
              </span>
            </div>
            {project.description && <p className="mt-0.5 text-sm text-muted-foreground">{project.description}</p>}
          </div>
        </div>
        {project.project_url && (
          <a
            href={project.project_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            <ExternalLink size={14} strokeWidth={1.5} />
            Živá verze
          </a>
        )}
      </div>

      <nav aria-label="Části zakázky" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {tabs.map((t) => (
            <li key={t}>
              <Link
                href={t === 'prehled' ? base : `${base}?zalozka=${t}`}
                aria-current={tab === t ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-4 text-sm font-medium transition-colors',
                  tab === t
                    ? 'border-navy-700 text-navy-700'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {TAB_LABELS[t]}
                {t === 'pozadavky' && openRequests > 0 && (
                  <span className="rounded-full bg-signal px-1.5 text-[11px] font-semibold leading-5 text-signal-ink">
                    {openRequests}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-2xl space-y-4">
        {tab === 'prehled' && <OverviewTab project={project} business={business} />}
        {tab === 'aktivita' && <ActivityTab project={project} />}
        {tab === 'pozadavky' && <RequestsTab project={project} />}
        {tab === 'zpravy' && <MessagesTab project={project} business={business} />}
        {tab === 'fakturace' && <BillingTab project={project} />}
      </div>
    </div>
  )
}

async function countOpenRequests(projectId: string): Promise<number> {
  try {
    const rows = await sql`SELECT count(*)::int AS count FROM client_requests WHERE project_id = ${projectId} AND status = 'new'`
    return (rows[0] as { count: number }).count
  } catch {
    return 0
  }
}

async function OverviewTab({ project, business }: { project: Project; business: Business }) {
  const publicUrl = getPublicUrl(project.public_token)

  return (
    <>
      <div className={card}>
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Editace zakázky</h2>
        <ProjectForm project={project} business={business} />
      </div>

      <div className={card}>
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sdílet s klientem</h2>
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <QRCodeDisplay url={publicUrl} />
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm text-muted-foreground">
              Pošlete klientovi odkaz. Bez registrace uvidí aktuální stav zakázky.
            </p>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
              <span className="flex-1 truncate font-mono text-xs text-brand-600">{publicUrl}</span>
            </div>
            <ShareButton token={project.public_token} />
          </div>
        </div>
      </div>

      {business === 'vizeon' && (
        <>
          <div className={card}>
            <h2 className={h2}>Přidat do dokončených</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Přidá záznam do sekce Dokončené zakázky a zahrne ji do kalkulačky výdělků. Zakázka zůstane i v aktivním přehledu.
            </p>
            <MarkCompletedButton
              projectId={project.id}
              projectName={project.client_name}
              hasEstimatedCosts={project.estimated_costs != null && Number(project.estimated_costs) > 0}
            />
          </div>
        </>
      )}

      <div className={card}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Nebezpečná zóna</h2>
        <p className="mb-4 text-xs text-muted-foreground">Smazání zakázky je nevratné.</p>
        <DeleteButton projectId={project.id} business={business} />
      </div>
    </>
  )
}

async function ActivityTab({ project }: { project: Project }) {
  const [items, key] = await Promise.all([loadProjectActivity(project.id), getActiveAgentKey(project.id)])
  const baseUrl = await appBaseUrl()
  return (
    <>
      <div className={card}>
        <h2 className={h2}>Aktivita</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Zprávy o tom, co se na zakázce udělalo. Klient vidí jen ty, které schválíte.
        </p>
        <ProjectActivityPanel projectId={project.id} items={items} />
      </div>

      <div className={card}>
        <h2 className={h2}>Napojení Claude Code</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Po dokončené práci pošle Claude Code hlášení jako koncept. Postup je v docs/klientsky-prostor/NAPOJENI-CLAUDE-CODE.md.
        </p>
        <AgentKeyPanel
          projectId={project.id}
          active={key ? { prefixMask: maskAgentKey(key.prefix), createdAt: key.createdAt, lastUsedAt: key.lastUsedAt } : null}
          envBlock={buildAgentEnvBlock({ projectId: project.id, baseUrl })}
          claudeMdBlock={buildClaudeMdBlock()}
          configured={isAgentKeyConfigured()}
        />
      </div>
    </>
  )
}

type JoinedRequest = ClientRequestRow & { client_name: string; description: string | null; focus: string | null; project_url: string | null; business: string | null }

async function RequestsTab({ project }: { project: Project }) {
  let rows: JoinedRequest[] = []
  try {
    rows = (await sql`
      SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.business
      FROM client_requests r JOIN projects p ON p.id = r.project_id
      WHERE r.project_id = ${project.id}
      ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT 50
    `) as unknown as JoinedRequest[]
  } catch {
    rows = []
  }

  const cards: ClientRequestCardData[] = rows.map((r) => {
    const business = toBusiness(r.business)
    const prompt = buildClaudeCodePrompt(r, {
      clientName: r.client_name,
      description: r.description,
      focus: r.focus,
      projectUrl: r.project_url,
    })
    return {
      id: r.id,
      clientName: r.client_name,
      projectHref: projectPath(business, project.id),
      businessLabel: BUSINESSES[business].label,
      source: r.source,
      status: r.status,
      aiStatus: r.ai_status,
      kind: r.ai_kind,
      summary: r.ai_summary,
      unclear: r.ai_unclear,
      rawText: r.raw_text,
      createdAt: new Date(r.created_at).toISOString(),
      prompt,
      terminalCommand: buildTerminalCommand(prompt),
    }
  })

  if (cards.length === 0) {
    return (
      <div className={card}>
        <h2 className={h2}>Požadavky klienta</h2>
        <p className="text-sm text-muted-foreground">
          Klient zatím nic nenapsal. Požadavky přijdou z jeho odkazu na přehled zakázky.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {cards.map((c) => (
        <ClientRequestCard key={c.id} request={c} />
      ))}
    </div>
  )
}

async function MessagesTab({ project, business }: { project: Project; business: Business }) {
  const [msgRows, progressRows, feedbackRows, slotRows, noteRows] = await Promise.all([
    sql`SELECT * FROM client_messages WHERE project_id = ${project.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM progress_updates WHERE project_id = ${project.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM client_feedback WHERE project_id = ${project.id} ORDER BY created_at DESC`,
    sql`SELECT * FROM consultation_slots WHERE project_id = ${project.id} ORDER BY scheduled_at DESC`,
    business === 'vizeon' ? sql`SELECT * FROM project_notes WHERE project_id = ${project.id} ORDER BY created_at DESC` : Promise.resolve([]),
  ])
  const messages = msgRows as ClientMessage[]
  const progressUpdates = progressRows as ProgressUpdate[]
  const feedbacks = feedbackRows as ClientFeedback[]
  const slots = slotRows as ConsultationSlot[]
  const notes = noteRows as ProjectNote[]
  const portalThread = await loadPortalThread(project.id)

  return (
    <>
      {portalThread && (
        <div className={card}>
          <h2 className={h2}>Zprávy v klientském prostoru</h2>
          <p className="mb-5 text-xs text-muted-foreground">
            Klient vám píše ze svého přihlášeného prostoru. Vaše odpověď se mu ukáže tam.
          </p>
          <PortalReplyPanel projectId={project.id} messages={portalThread} />
        </div>
      )}

      <div className={card}>
        <h2 className={h2}>Vzkazy pro klienta</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Klient je uvidí na svém přehledu. Interní poznámky v editaci zakázky klient nevidí.
        </p>
        <ClientMessagesEditor
          projectId={project.id}
          publicToken={project.public_token}
          messages={messages}
          business={business}
        />
      </div>

      {progressUpdates.length > 0 && (
        <div className={card}>
          <h2 className={h2}>Historie postupu</h2>
          <p className="mb-5 text-xs text-muted-foreground">Vidí i klient na svém přehledu.</p>
          <ul className="space-y-3">
            {progressUpdates.map((u, i) => (
              <li key={u.id} className="relative flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                  {i < progressUpdates.length - 1 && <div className="mt-1 w-px flex-1 bg-brand-100" />}
                </div>
                <div className="flex-1 pb-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      {u.progress_from}% → {u.progress_to}%
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(u.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{u.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card}>
        <h2 className={h2}>Zpětná vazba klienta</h2>
        <p className="mb-5 text-xs text-muted-foreground">NPS hodnocení a poznámky odeslané klientem přes klientský portál.</p>
        <FeedbackFeed feedbacks={feedbacks} clientName={project.client_name} />
      </div>

      <div className={card}>
        <h2 className={h2}>Konzultace</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Termíny rezervované klientem. Kliknutím zobrazíte detail a odkaz na hovor.
        </p>
        <ConsultationCalendar slots={slots} clientName={project.client_name} />
      </div>

      {business === 'vizeon' && (
        <div className={cn(card, 'max-w-none')}>
          <h2 className={h2}>Poznámky ze schůzek a hovorů</h2>
          <p className="mb-5 text-xs text-muted-foreground">
            Jen pro vás, klient je nikdy neuvidí. Stav zakázky se sem jen zrcadlí, měníte ho v Editaci zakázky na záložce Přehled.
          </p>
          <ProjectNotesPanel projectId={project.id} initialNotes={notes} currentProgress={project.progress} />
        </div>
      )}
    </>
  )
}

/** Vlákno zpráv, jen když je zakázka propojená s klientským prostorem (jinak null). */
async function loadPortalThread(projectId: string): Promise<PortalThreadMessage[] | null> {
  try {
    const linked = await sql`SELECT 1 FROM portal.projects WHERE id = ${projectId}`
    if (!linked.length) return null
    const rows = await sql`
      SELECT id, author, body, created_at FROM portal.messages
      WHERE project_id = ${projectId} ORDER BY created_at ASC LIMIT 200
    `
    return (rows as { id: string; author: 'client' | 'admin'; body: string; created_at: string }[]).map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      createdAt: new Date(m.created_at).toISOString(),
    }))
  } catch {
    return null
  }
}

async function BillingTab({ project }: { project: Project }) {
  const [invoices, costs] = await Promise.all([getProjectInvoices(project.id), getProjectCosts(project.id)])
  return (
    <>
      <div className={card}>
        <InvoiceArchive
          data={invoices}
          defaults={{
            project_id: project.id,
            client_name: project.client_name,
            amount: project.price !== null ? String(project.price) : '',
          }}
          title="Faktury zakázky"
          description="Doklady k téhle zakázce. PDF stačí přetáhnout kamkoliv na tuhle kartu, AI z něj vyplní pole. Zaplacená faktura založí příjem v přiznané linii."
          paidLabel="Zaplacené"
        />
      </div>

      <div className={card}>
        <h2 className={h2}>Náklady zakázky</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Skutečné náklady se promítají do cash flow ve Financích. Odhad v editaci zakázky je jen orientační.
        </p>
        <CostsManager initialCosts={costs} projectId={project.id} />
      </div>
    </>
  )
}
