import { sql } from '@/lib/db'
import { LEAD_ORIGINS, projectPath, toLeadOrigin } from '@/lib/lead-origins'
import { buildTerminalCommand } from '@/lib/claude-code-handoff'
import { buildClaudeCodePrompt, type ClientRequestRow } from '@/lib/client-requests'
import { ClientRequestCard, type ClientRequestCardData } from '@/components/ClientRequestCard'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { EmptyState } from '@/components/ws/brand'

interface PageProps {
  searchParams: Promise<{ stav?: string }>
}

type JoinedRow = ClientRequestRow & {
  client_name: string
  description: string | null
  focus: string | null
  project_url: string | null
  lead_origin: string | null
}

// Požadavky klientů z portálu — jedna fronta pro všechny zakázky.
export default async function PozadavkyPage({ searchParams }: PageProps) {
  const { stav } = await searchParams
  const showClosed = stav === 'vyrizene'

  const rows = (showClosed
    ? await sql`
        SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.lead_origin
        FROM client_requests r JOIN projects p ON p.id = r.project_id
        WHERE r.status <> 'new'
        ORDER BY r.created_at DESC LIMIT 100
      `
    : await sql`
        SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.lead_origin
        FROM client_requests r JOIN projects p ON p.id = r.project_id
        WHERE r.status = 'new'
        ORDER BY r.created_at DESC LIMIT 100
      `) as unknown as JoinedRow[]

  const cards: ClientRequestCardData[] = rows.map(r => {
    const prompt = buildClaudeCodePrompt(r, {
      clientName: r.client_name,
      description: r.description,
      focus: r.focus,
      projectUrl: r.project_url,
    })
    return {
      id: r.id,
      clientName: r.client_name,
      projectHref: projectPath(r.project_id),
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
    }
  })

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Požadavky klientů"
        subtitle="Co klienti napsali nebo nadiktovali v portálu. Zadání zkontrolujte a vložte do Claude Code ručně."
        subtitleFont="sans"
      />

      <PillNav
        label="Stav požadavku"
        variant="segmented"
        items={[
          { key: 'nove', label: 'Nové', href: '/dashboard/pozadavky', active: !showClosed },
          { key: 'vyrizene', label: 'Vyřízené', href: '/dashboard/pozadavky?stav=vyrizene', active: showClosed },
        ]}
      />

      {cards.length === 0 ? (
        <EmptyState
          title={showClosed ? 'Zatím nic vyřízeného' : 'Žádné nové požadavky'}
          description={
            showClosed
              ? 'Až označíte požadavek jako hotový, najdete ho tady.'
              : 'Až klient pošle požadavek z portálu, objeví se tady a přijde vám upozornění.'
          }
        />
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <ClientRequestCard key={card.id} request={card} />
          ))}
        </div>
      )}
    </PageShell>
  )
}
