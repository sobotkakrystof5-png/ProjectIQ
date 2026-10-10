'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LiveDot } from '@/components/ws/brand'
import { markBellSeenAction } from '@/app/w/[business]/zvonek/actions'
import { cn } from '@/lib/ws/utils'

export type BellItem = { id: string; title: string; body: string | null; link: string | null; at: string; read: boolean }
export type BellNews = { id: string; title: string; body: string; link: string | null; at: string }

/**
 * Upozornění v aplikaci (S15). Po otevření se označí jako přečtená (tečky
 * nepřečtených zůstanou vidět, dokud se zvonek nezavře). Nahoře „Co je
 * nového“ v ZakazIQ, když je co ukázat.
 */
export function NotificationsBell({
  slug,
  items,
  unread,
  news,
  newsUnseen,
}: {
  slug: string
  items: BellItem[]
  unread: number
  news: BellNews[]
  newsUnseen: boolean
}) {
  const router = useRouter()
  const [marked, setMarked] = useState(false)
  const fresh = !marked && (unread > 0 || newsUnseen)
  const label = unread > 0 ? `Upozornění, ${unread} nepřečtených` : 'Upozornění'

  const onOpenChange = (open: boolean) => {
    if (open && fresh) {
      setMarked(true)
      void markBellSeenAction({ slug }).then(() => undefined)
    }
    if (!open && marked) router.refresh()
  }

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        aria-label={label}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet transition-colors duration-200 ease-zq hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-navy-800"
      >
        <Bell aria-hidden size={20} strokeWidth={1.5} />
        {fresh && <LiveDot className="absolute right-2.5 top-2.5" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(560px,80vh)] w-[min(360px,calc(100vw-32px))] overflow-y-auto p-2">
        {news.length > 0 && (
          <section aria-label="Co je nového" className="mb-1 border-b border-navy-100 pb-2">
            <p className="px-2 pb-1 pt-1.5 font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Co je nového</p>
            <ul className="flex flex-col">
              {news.map((n) => (
                <li key={n.id} className="rounded-chip px-2 py-2">
                  <span className="block text-[15px] font-semibold text-ink">{n.title}</span>
                  <span className="mt-0.5 block whitespace-pre-line text-sm text-quiet">{n.body}</span>
                  <span className="mt-1 flex items-center gap-3">
                    <span className="font-num text-xs text-quiet">{n.at}</span>
                    {n.link && (
                      <a href={n.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 underline-offset-4 hover:underline">
                        Více
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
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
