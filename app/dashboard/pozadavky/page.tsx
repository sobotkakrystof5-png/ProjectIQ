import { batchTolerant } from '@/lib/admin/db'
import { LEAD_ORIGINS, projectPath, toLeadOrigin } from '@/lib/lead-origins'
import { buildTerminalCommand } from '@/lib/claude-code-handoff'
import { buildClaudeCodePrompt, type ClientRequestRow } from '@/lib/client-requests'
import { ClientRequestCard, type ClientRequestCardData } from '@/components/ClientRequestCard'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { PillNav } from '@/components/ws/app/toolbar'
import { Pagination } from '@/components/admin/pagination'
import { EmptyState } from '@/components/ws/brand'
import { parseTableParams, tableHref, tableLinks } from '@/lib/admin-table'

const PATH = '/dashboard/pozadavky'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type JoinedRow = ClientRequestRow & {
  client_name: string
  description: string | null
  focus: string | null
  project_url: string | null
  lead_origin: string | null
}

// Požadavky klientů z portálu — jedna fronta pro všechny zakázky.
// Od AD07 se čte po stránkách a počty u pilulek počítá databáze.
export default async function PozadavkyPage({ searchParams: raw }: PageProps) {
  const searchParams = await raw
  const showClosed = searchParams.stav === 'vyrizene'
  const params = parseTableParams(searchParams, {
    allowed: { nove: { sql: 'r.created_at', dir: 'desc' } },
    defaultSort: 'nove',
    pageSize: 25,
  })

  // `client_requests` je z migrace 092 a nemusí být všude — proto dávka,
  // která chybějící tabulku přežije (vrátí prázdno místo chyby).
  const [rows, counts] = (await batchTolerant([
    {
      text: `SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.lead_origin
             FROM client_requests r JOIN projects p ON p.id = r.project_id
             WHERE r.status ${showClosed ? '<>' : '='} 'new'
             ORDER BY r.created_at DESC
             LIMIT $1 OFFSET $2`,
      params: [params.limit, params.offset],
    },
    {
      text: `SELECT count(*) FILTER (WHERE status = 'new')::int AS nove,
                    count(*) FILTER (WHERE status <> 'new')::int AS vyrizene
             FROM client_requests`,
      params: [],
    },
  ])) as [JoinedRow[], { nove: number; vyrizene: number }[]]

  const open = Number(counts[0]?.nove ?? 0)
  const closed = Number(counts[0]?.vyrizene ?? 0)
  const links = tableLinks(PATH, searchParams)

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
          {
            key: 'nove',
            label: 'Nové',
            href: tableHref(PATH, searchParams, { stav: null, page: null }),
            active: !showClosed,
            count: open,
          },
          {
            key: 'vyrizene',
            label: 'Vyřízené',
            href: tableHref(PATH, searchParams, { stav: 'vyrizene', page: null }),
            active: showClosed,
            count: closed,
          },
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
        <>
          <div className="space-y-3">
            {cards.map(card => (
              <ClientRequestCard key={card.id} request={card} />
            ))}
          </div>
          <Pagination params={params} total={showClosed ? closed : open} links={links} />
        </>
      )}
    </PageShell>
  )
}
