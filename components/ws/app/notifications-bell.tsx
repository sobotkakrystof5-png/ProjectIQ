'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LiveDot } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

export type BellItem = { id: string; title: string; body: string | null; link: string | null; at: string; read: boolean }

/**
 * Upozornění v aplikaci. Zatím jen seznam posledních — vznikat a označovat
 * se jako přečtená budou v S15 (e-maily a upozornění).
 */
export function NotificationsBell({ items, unread }: { items: BellItem[]; unread: number }) {
  const label = unread > 0 ? `Upozornění, ${unread} nepřečtených` : 'Upozornění'
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet transition-colors duration-200 ease-zq hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-navy-800"
      >
        <Bell aria-hidden size={20} strokeWidth={1.5} />
        {unread > 0 && <LiveDot className="absolute right-2.5 top-2.5" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-32px))] p-2">
        <p className="px-2 pb-1 pt-1.5 font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Upozornění</p>
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-[15px] text-quiet">Žádná upozornění. Nová poptávka se ukáže tady.</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((n) => {
              const content = (
                <>
                  <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-signal" aria-label="nepřečtené" />}
                    <span className="truncate">{n.title}</span>
                  </span>
                  {n.body && <span className="block truncate text-sm text-quiet">{n.body}</span>}
                  <span className="block font-num text-xs text-quiet">{n.at}</span>
                </>
              )
              const cls = cn('block min-h-11 rounded-chip px-2 py-2', n.link && 'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')
              return (
                <li key={n.id}>
                  {n.link && n.link.startsWith('/w/') ? (
                    <Link href={n.link} scroll={false} className={cls}>
                      {content}
                    </Link>
                  ) : (
                    <div className={cls}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
