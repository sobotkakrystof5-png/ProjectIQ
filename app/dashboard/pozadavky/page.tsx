import Link from 'next/link'
import { sql } from '@/lib/db'
import { BUSINESSES, projectPath, toBusiness } from '@/lib/business'
import { buildTerminalCommand } from '@/lib/claude-code-handoff'
import { buildClaudeCodePrompt, type ClientRequestRow } from '@/lib/client-requests'
import { ClientRequestCard, type ClientRequestCardData } from '@/components/ClientRequestCard'
import { cn } from '@/lib/utils'

interface PageProps {
  searchParams: Promise<{ stav?: string }>
}

type JoinedRow = ClientRequestRow & {
  client_name: string
  description: string | null
  focus: string | null
  project_url: string | null
  business: string | null
}

// Požadavky klientů z portálu napříč VIZEON i ALTENO (jedna fronta, jeden člověk).
export default async function PozadavkyPage({ searchParams }: PageProps) {
  const { stav } = await searchParams
  const showClosed = stav === 'vyrizene'

  const rows = (showClosed
    ? await sql`
        SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.business
        FROM client_requests r JOIN projects p ON p.id = r.project_id
        WHERE r.status <> 'new'
        ORDER BY r.created_at DESC LIMIT 100
      `
    : await sql`
        SELECT r.*, p.client_name, p.description, p.focus, p.project_url, p.business
        FROM client_requests r JOIN projects p ON p.id = r.project_id
        WHERE r.status = 'new'
        ORDER BY r.created_at DESC LIMIT 100
      `) as unknown as JoinedRow[]

  const cards: ClientRequestCardData[] = rows.map(r => {
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
      projectHref: projectPath(business, r.project_id),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Požadavky klientů</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Co klienti napsali nebo nadiktovali v portálu. Zadání zkontrolujte a vložte do Claude Code ručně.
        </p>
      </div>

      <div className="flex gap-1.5">
        {[
          { href: '/dashboard/pozadavky', label: 'Nové', active: !showClosed },
          { href: '/dashboard/pozadavky?stav=vyrizene', label: 'Vyřízené', active: showClosed },
        ].map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab.active ? 'bg-brand-50 text-brand-800' : 'text-muted-foreground hover:bg-brand-50',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-6 py-14 text-center">
          <p className="font-medium text-foreground">{showClosed ? 'Zatím nic vyřízeného' : 'Žádné nové požadavky'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {showClosed
              ? 'Až označíte požadavek jako hotový, najdete ho tady.'
              : 'Až klient pošle požadavek z portálu, objeví se tady a přijde vám upozornění.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <ClientRequestCard key={card.id} request={card} />
          ))}
        </div>
      )}
    </div>
  )
}
