import Link from 'next/link'
import { cn } from '@/lib/utils'
import { pragueDayOf } from '@/lib/prague-time'
import type { ChatThreadSummary } from '@/lib/chat/types'

/**
 * Zakázky jako kanály (KP15, R-123): poslední zpráva, čas a počet
 * nepřečtených v tónu `signal`. Nepřečtené vlákno je tučně. Stejné v prostoru
 * klienta i ve schránce Zprávy.
 */

const TIME = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' })
const DATE = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' })

function when(iso: string): string {
  return pragueDayOf(iso) === pragueDayOf(new Date()) ? TIME.format(new Date(iso)) : DATE.format(new Date(iso))
}

export function ThreadList({
  threads,
  activeId,
  hrefBase,
  viewer,
  empty,
}: {
  threads: ChatThreadSummary[]
  activeId: string | null
  hrefBase: string
  viewer: 'client' | 'admin'
  empty: string
}) {
  if (threads.length === 0) return <p className="px-4 py-6 text-sm text-quiet">{empty}</p>
  return (
    <ul className="divide-y divide-navy-50">
      {threads.map((t) => {
        const active = t.projectId === activeId
        const prefix = t.lastMessage && t.lastMessage.author === viewer ? 'Vy: ' : ''
        return (
          <li key={t.projectId}>
            <Link
              href={`${hrefBase}/${t.projectId}`}
              aria-current={active ? 'page' : undefined}
              className={cn('flex min-h-[64px] items-start gap-3 px-4 py-3 transition-colors', active ? 'bg-navy-50' : 'hover:bg-navy-50/60')}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-sm text-ink', t.unread > 0 ? 'font-semibold' : 'font-medium')}>{t.title}</span>
                  {t.lastMessage && <span className="shrink-0 font-num text-xs text-quiet">{when(t.lastMessage.createdAt)}</span>}
                </span>
                {t.subtitle && <span className="block truncate text-xs text-quiet">{t.subtitle}</span>}
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn('line-clamp-1 text-sm', t.unread > 0 ? 'text-ink' : 'text-quiet')}>
                    {t.lastMessage ? `${prefix}${t.lastMessage.body}` : 'Zatím žádné zprávy'}
                  </span>
                  {t.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-semibold text-signal-ink" aria-label={`${t.unread} nepřečtených`}>
                      {t.unread > 99 ? '99+' : t.unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
