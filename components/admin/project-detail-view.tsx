import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { batchTolerant, q, type AdminQuery, type AdminRow } from '@/lib/admin/db'
import { ProjectForm } from '@/components/ProjectForm'
import { ShareButton } from '@/components/ShareButton'
import { QRCodeDisplay } from '@/components/QRCodeDisplay'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { ClientMessagesEditor } from '@/components/ClientMessagesEditor'
import { FeedbackFeed } from '@/components/FeedbackFeed'
import { ConsultationCalendar } from '@/components/ConsultationCalendar'
import { ProjectNotesPanel } from '@/components/ProjectNotesPanel'
import { DeleteButton } from '@/components/DeleteButton'
import { CloseProjectButton, ReopenProjectButton } from '@/components/admin/close-project'
import { ProjectJourney } from '@/components/admin/project-journey'
import { InvoiceArchive } from '@/components/InvoiceArchive'
import { ProjectCosts } from '@/components/admin/costs/project-costs'
import { ClientRequestCard, type ClientRequestCardData } from '@/components/ClientRequestCard'
import { ContactActions } from '@/components/admin/contact-actions'
import { ProjectActivityPanel } from '@/components/ProjectActivityPanel'
import { AgentKeyPanel } from '@/components/AgentKeyPanel'
import { PortalReplyPanel, type PortalThreadMessage } from '@/components/admin/portal-reply-panel'
import { getProjectInvoices } from '@/app/dashboard/finance/invoice-actions'
import { getProjectCosts } from '@/app/costs-actions'
import { getActiveAgentKey, isAgentKeyConfigured, maskAgentKey } from '@/lib/agent-keys'
import { buildAgentEnvBlock, buildClaudeMdBlock } from '@/lib/agent-setup'
import { loadProjectActivity } from '@/lib/project-activity-queries'
import { buildTerminalCommand } from '@/lib/claude-code-handoff'
import { buildClaudeCodePrompt, type ClientRequestRow } from '@/lib/client-requests'
import { LEAD_ORIGINS, projectPath, toLeadOrigin } from '@/lib/lead-origins'
import { buildJourney, journeySqlText, type JourneyFacts } from '@/lib/admin/journey'
import { formatDate, getPublicUrl, cn } from '@/lib/utils'
import type {
  Project, ProjectStatus, ClientMessage, ProgressUpdate, ClientFeedback, ConsultationSlot, ProjectNote,
} from '@/lib/types'

// Detail zakázky jako centrum (KP02): jedno místo se záložkami. Záložka je
// v adrese (?zalozka=), takže jde sdílet a vrátit se tlačítkem Zpět; načítají
// se jen data aktivní záložky. Logika ukládání je beze změny (ProjectForm,
// app/actions.ts).
//
// Po sloučení byznysů (AD02, R-088) má každá zakázka všechny záložky —
// i poptávky z alteno.cz mají Fakturaci, dokončení a poznámky ze schůzek.
// `lead_origin` je už jen štítek „odkud přišla".

export const DETAIL_TABS = ['prehled', 'aktivita', 'pozadavky', 'zpravy', 'fakturace'] as const
export type DetailTab = (typeof DETAIL_TABS)[number]

const TAB_LABELS: Record<DetailTab, string> = {
  prehled: 'Přehled',
  aktivita: 'Aktivita',
  pozadavky: 'Požadavky',
  zpravy: 'Zprávy',
  fakturace: 'Fakturace',
}

export function parseTab(value: string | undefined): DetailTab {
  return DETAIL_TABS.find((t) => t === value) ?? 'prehled'
}

const card = 'rounded-2xl border border-border bg-white p-6 shadow-sm'
const h2 = 'mb-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground'

async function appBaseUrl(): Promise<string> {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function ProjectDetailView({
  projectId,
  tabParam,
}: {
  projectId: string
  tabParam: string | undefined
}) {
  // Adresa, která není UUID (třeba zrušená /dashboard/sablony), spadne sem jako
  // id zakázky. Bez téhle kontroly by dotaz skončil chybou typu a stránka 500.
  if (!UUID.test(projectId)) notFound()
  const tab = parseTab(tabParam)

  // Jedna dávka na celou obrazovku (AD06): zakázka, odznak u Požadavků
  // i data zobrazené záložky. Dřív to bylo 12 dotazů v pěti vlnách za sebou.
  // Záložky Aktivita a Fakturace čtou přes sdílené funkce (faktury a náklady
  // mají svoje mapování v `invoice-actions`/`costs-actions`), takže jim zbývá
  // druhá vlna — přepisuje je AD12/AD13.
  const [projectRows, requestCount, journeyRows, ...tabRows] = await batchTolerant([
    q`SELECT * FROM projects WHERE id = ${projectId} LIMIT 1`,
    q`SELECT count(*)::int AS count FROM client_requests WHERE project_id = ${projectId} AND status = 'new'`,
    // Průvodka nečte nic nového, jen se ptá, co už v databázi je (AD11).
    { text: journeySqlText(), params: [projectId] },
    ...tabQueries(tab, projectId),
  ])
  if (!projectRows.length) notFound()
  const project = projectRows[0] as unknown as Project & { lead_origin?: string }
  const origin = LEAD_ORIGINS[toLeadOrigin(project.lead_origin)]

  const base = projectPath(projectId)
  const tabs = DETAIL_TABS

  const openRequests = Number((requestCount[0] as { count?: number } | undefined)?.count ?? 0)

  const raw = journeyRows[0] as
    | { schuzka: boolean; faktura: boolean; faktura_zaplacena: boolean; hodnoceni: boolean }
    | undefined
  const facts: JourneyFacts = {
    schuzka: raw?.schuzka ?? false,
    faktura: raw?.faktura ?? false,
    fakturaZaplacena: raw?.faktura_zaplacena ?? false,
    hodnoceni: raw?.hodnoceni ?? false,
  }
  const journey = buildJourney(project, facts)

  return (
    <PageShell width={tab === 'fakturace' ? 'wide' : 'narrow'}>
      <div>
        <Link
          href="/dashboard/zakazky"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-quiet transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Zpět na zakázky
        </Link>
        <PageHeader
          className="mt-4"
          title={project.client_name}
          subtitle={project.description ?? undefined}
          subtitleFont="sans"
          action={
            <>
              <StatusBadge status={project.status as ProjectStatus} />
              <Badge variant="neutral" title={origin.domain ? `Poptávka z ${origin.domain}` : 'Zadáno ručně'}>
                {origin.label}
              </Badge>
              {project.project_url && (
                <a
                  href={project.project_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-chip px-3 text-sm text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-800"
                >
                  <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
                  Živá verze
                </a>
              )}
            </>
          }
        />
        <ContactActions
          className="mt-3"
          phone={project.client_phone}
          email={project.client_email}
          context={{ projectName: project.client_name, portalUrl: getPublicUrl(project.public_token) }}
          emptyHint="Zakázka nemá telefon ani e-mail. Doplňte je v Editaci zakázky a zavoláte odsud jedním klikem."
        />
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
        <ProjectJourney projectId={project.id} steps={journey} status={project.status as ProjectStatus} />
      </div>

      <nav aria-label="Části zakázky" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-navy-100">
          {tabs.map((t) => (
            <li key={t}>
              <Link
                href={t === 'prehled' ? base : `${base}?zalozka=${t}`}
                aria-current={tab === t ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-4 text-sm font-medium transition-colors',
                  tab === t
                    ? 'border-navy-700 text-navy-700'
                    : 'border-transparent text-quiet hover:text-ink',
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

      <div className="space-y-4">
        {tab === 'prehled' && <OverviewTab project={project} />}
        {tab === 'aktivita' && <ActivityTab project={project} />}
        {tab === 'pozadavky' && <RequestsTab project={project} rows={tabRows[0] ?? []} />}
        {tab === 'zpravy' && <MessagesTab project={project} rows={tabRows} />}
        {tab === 'fakturace' && <BillingTab project={project} />}
      </div>
    </PageShell>
  )
}

/**
 * Dotazy zobrazené záložky — jedou v téže dávce jako hlavička. Záložky, které
 * si data berou přes sdílené funkce (Aktivita, Fakturace), tu nic nemají.
 */
function tabQueries(tab: DetailTab, projectId: string): AdminQuery[] {
  if (tab === 'pozadavky') {
    return [
      q`
        SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.lead_origin
        FROM client_requests r JOIN projects p ON p.id = r.project_id
        WHERE r.project_id = ${projectId}
        ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT 50
      `,
    ]
  }
  if (tab === 'zpravy') {
    return [
      q`SELECT id, project_id, content, created_at FROM client_messages
         WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 100`,
      q`SELECT id, project_id, progress_from, progress_to, description, created_at FROM progress_updates
         WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 100`,
      q`SELECT id, project_id, nps, content, created_at FROM client_feedback
         WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 100`,
      q`SELECT id, project_id, scheduled_at, channel, channel_other_text, client_wish, meeting_link, client_email, created_at
         FROM consultation_slots WHERE project_id = ${projectId} ORDER BY scheduled_at DESC LIMIT 100`,
      q`SELECT id, project_id, author, content, progress_snapshot, created_at FROM project_notes
         WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 200`,
      // Vlákno z klientského prostoru. Žádný řádek = zakázka tam propojená
      // není a panel se neukáže; propojená bez zpráv vrátí řádek s prázdným
      // `id`. Schéma `portal` nemusí existovat — proto `batchTolerant`.
      q`SELECT m.id, m.author, m.body, m.created_at
         FROM portal.projects p LEFT JOIN portal.messages m ON m.project_id = p.id
         WHERE p.id = ${projectId} ORDER BY m.created_at ASC LIMIT 200`,
    ]
  }
  return []
}

async function OverviewTab({ project }: { project: Project }) {
  const publicUrl = getPublicUrl(project.public_token)

  return (
    <>
      <div className={card} id="editace-zakazky">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Editace zakázky</h2>
        <ProjectForm project={project} />
      </div>

      <div className={card}>
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sdílet s klientem</h2>
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <QRCodeDisplay url={publicUrl} />
          {/*
            `w-full` kvůli telefonu: `items-start` dává v sloupcovém směru
            šířku podle obsahu, takže věta o odkazu roztáhla stránku o 110 px
            přes okno. Ve `sm:` řádku šířku dál určuje `flex-1`.
          */}
          <div className="w-full min-w-0 flex-1">
            <p className="mb-3 text-sm text-muted-foreground">
              Pošlete klientovi odkaz. Bez registrace uvidí aktuální stav zakázky.
            </p>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2">
              <span className="flex-1 truncate font-mono text-xs text-navy-600">{publicUrl}</span>
            </div>
            <ShareButton token={project.public_token} />
          </div>
        </div>
      </div>

      <div className={card}>
        <h2 className={h2}>{project.closed_at ? 'Uzavřená zakázka' : 'Uzavřít zakázku'}</h2>
        {project.closed_at ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Uzavřeno <span className="font-num">{formatDate(project.closed_at)}</span>. Zakázka se počítá do přehledu
              výkonnosti na Profilu.
            </p>
            <ReopenProjectButton projectId={project.id} status={project.status as ProjectStatus} />
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs text-muted-foreground">
              Hotová zakázka se započítá do přehledu výkonnosti a klientovi odejde poděkování s dotazníkem.
              Uzavření jde vzít zpět.
            </p>
            <CloseProjectButton
              projectId={project.id}
              projectName={project.client_name}
              hasEstimatedCosts={project.estimated_costs != null && Number(project.estimated_costs) > 0}
            />
          </>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Nebezpečná zóna</h2>
        <p className="mb-4 text-xs text-muted-foreground">Smazání zakázky je nevratné.</p>
        <DeleteButton projectId={project.id} />
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

type JoinedRequest = ClientRequestRow & { client_name: string; description: string | null; focus: string | null; project_url: string | null; lead_origin: string | null }

function RequestsTab({ project, rows: raw }: { project: Project; rows: AdminRow[] }) {
  const rows = raw as unknown as JoinedRequest[]

  const cards: ClientRequestCardData[] = rows.map((r) => {
    const prompt = buildClaudeCodePrompt(r, {
      clientName: r.client_name,
      description: r.description,
      focus: r.focus,
      projectUrl: r.project_url,
    })
    return {
      id: r.id,
      clientName: r.client_name,
      projectHref: projectPath(project.id),
      originLabel: LEAD_ORIGINS[toLeadOrigin(r.lead_origin)].label,
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
      phone: project.client_phone,
      email: project.client_email,
      portalUrl: getPublicUrl(project.public_token),
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

function MessagesTab({ project, rows }: { project: Project; rows: AdminRow[][] }) {
  const [msgRows = [], progressRows = [], feedbackRows = [], slotRows = [], noteRows = [], portalRows = []] = rows
  const messages = msgRows as unknown as ClientMessage[]
  const progressUpdates = progressRows as unknown as ProgressUpdate[]
  const feedbacks = feedbackRows as unknown as ClientFeedback[]
  const slots = slotRows as unknown as ConsultationSlot[]
  const notes = noteRows as unknown as ProjectNote[]
  const portalThread = portalMessages(portalRows)

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
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-navy-600" />
                  {i < progressUpdates.length - 1 && <div className="mt-1 w-px flex-1 bg-navy-100" />}
                </div>
                <div className="flex-1 pb-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-navy-100 bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">
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

      <div className={cn(card, 'max-w-none')}>
        <h2 className={h2}>Poznámky ze schůzek a hovorů</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Jen pro vás, klient je nikdy neuvidí. Stav zakázky se sem jen zrcadlí, měníte ho v Editaci zakázky na záložce Přehled.
        </p>
        <ProjectNotesPanel projectId={project.id} initialNotes={notes} currentProgress={project.progress} />
      </div>
    </>
  )
}

/**
 * Vlákno zpráv z klientského prostoru. Prázdný výsledek = zakázka tam
 * propojená není a panel se neukáže; propojená bez zpráv dá jeden řádek
 * s prázdným `id` (LEFT JOIN), tedy prázdné vlákno.
 */
function portalMessages(rows: AdminRow[]): PortalThreadMessage[] | null {
  if (!rows.length) return null
  return (rows as unknown as { id: string | null; author: 'client' | 'admin'; body: string; created_at: string }[])
    .filter((m) => m.id !== null)
    .map((m) => ({
      id: m.id as string,
      author: m.author,
      body: m.body,
      createdAt: new Date(m.created_at).toISOString(),
    }))
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
        <ProjectCosts costs={costs} projectId={project.id} />
      </div>
    </>
  )
}
