import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { adminTouchThread } from '@/app/dashboard/zpravy/actions'
import { ChatLive } from '@/components/chat/chat-live'
import { ThreadList } from '@/components/chat/thread-list'
import type { AdminThreadInfo } from '@/lib/admin/chat'
import type { ChatThreadSummary } from '@/lib/chat/types'
import { STATUS_LABELS, type ProjectStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Schránka Zprávy v adminu ve stejném rozvržení jako klientský prostor
 * (KP15, R-123): vlevo konverzace všech klientů, uprostřed chat, vpravo
 * klient a zakázka. Na telefonu jako WhatsApp — seznam, nebo chat.
 */

export function AdminInbox({
  threads,
  activeId,
  children,
  aside,
}: {
  threads: ChatThreadSummary[]
  activeId: string | null
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  const unread = threads.reduce((s, t) => s + t.unread, 0)
  return (
    <div className="flex h-[calc(100dvh-57px-96px)] min-h-[420px] border-y border-navy-100 bg-surface lg:h-[calc(100dvh-1.5rem)] lg:border-t-0">
      <ChatLive stateUrl="/api/zpravy/stav" projectId={activeId ?? undefined} touch={activeId ? adminTouchThread : undefined} unread={unread} />
      <div className={cn('w-full shrink-0 flex-col border-r border-navy-100 lg:flex lg:w-80', activeId ? 'hidden' : 'flex')}>
        <h1 className="border-b border-navy-100 px-4 py-3 text-lg font-semibold text-ink">Zprávy</h1>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ThreadList threads={threads} activeId={activeId} hrefBase="/dashboard/zpravy" viewer="admin" empty="Zatím žádná zakázka propojená s klientským prostorem." />
        </div>
      </div>
      <div className={cn('min-w-0 flex-1 flex-col bg-ground', activeId ? 'flex' : 'hidden lg:flex')}>{children}</div>
      {aside && <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-navy-100 bg-surface xl:block" aria-label="Klient a zakázka">{aside}</aside>}
    </div>
  )
}

const RELATIVE = new Intl.RelativeTimeFormat('cs-CZ', { numeric: 'auto' })

function lastSeen(iso: string | null): string {
  if (!iso) return 'V prostoru zatím nebyl(a).'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 2) return 'V prostoru je teď.'
  if (minutes < 60) return `Naposledy v prostoru ${RELATIVE.format(-minutes, 'minute')}.`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `Naposledy v prostoru ${RELATIVE.format(-hours, 'hour')}.`
  return `Naposledy v prostoru ${RELATIVE.format(-Math.round(hours / 24), 'day')}.`
}

/** Pravý panel: klient, zakázka, poslední aktivita klienta (D-K19 — vidí jen admin). */
export function AdminThreadAside({ info }: { info: AdminThreadInfo }) {
  const status = (info.status in STATUS_LABELS ? info.status : 'new') as ProjectStatus
  return (
    <div className="space-y-5 p-5 text-sm">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-quiet">Klient</h2>
        <p className="mt-2 font-semibold text-ink">{info.clientName}</p>
        <p className="text-quiet">{lastSeen(info.clientLastSeen)}</p>
      </section>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-quiet">Zakázka</h2>
        <p className="mt-2 font-semibold text-ink">{info.projectName}</p>
        <p className="text-quiet">
          {STATUS_LABELS[status]} · hotovo {info.progress} %{info.deadline ? ` · termín ${info.deadline.split('-').reverse().join('. ')}` : ''}
        </p>
      </section>
      <div className="flex flex-col gap-1 border-t border-navy-100 pt-3">
        <Link href={`/dashboard/${info.projectId}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink hover:underline">
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" /> Otevřít zakázku
        </Link>
        <Link href="/dashboard/pozadavky" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink hover:underline">
          <FileText size={14} strokeWidth={1.5} aria-hidden="true" /> Požadavky klientů
        </Link>
      </div>
      <p className="text-xs text-quiet">
        Zadání pro Claude Code: zaškrtněte zprávy klienta a klikněte „Udělat z toho zadání". Zprávu ke schválení pošlete zaškrtnutím pod polem.
      </p>
    </div>
  )
}
