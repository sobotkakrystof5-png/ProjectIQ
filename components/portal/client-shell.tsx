import Link from 'next/link'
import { CalendarClock, LayoutGrid, MessagesSquare, Receipt } from 'lucide-react'
import { signOutClient } from '@/app/klient/actions'
import { touchThread } from '@/app/klient/zpravy/actions'
import { Logo } from '@/components/ws/brand'
import { ChatLive } from '@/components/chat/chat-live'
import { ThreadList } from '@/components/chat/thread-list'
import { listClientThreads, totalUnread } from '@/lib/portal/chat'
import type { PortalContext } from '@/lib/portal/context'
import type { ChatThreadSummary } from '@/lib/chat/types'
import { cn } from '@/lib/utils'

/**
 * Klientský prostor rozvržený jako Slack, jen jednodušší (KP15, R-123).
 * Vlevo firma klienta, Přehled, zakázky jako kanály (nepřečtené tučně
 * s počtem), Faktury a Konzultace. Uprostřed obsah stránky. Na telefonu
 * jako WhatsApp: dole lišta Zprávy · Přehled · Faktury · Konzultace a chat
 * přes celou obrazovku.
 */

export type ClientSection = 'zpravy' | 'prehled' | 'faktury' | 'konzultace'

const NAV: { section: ClientSection; href: string; label: string; icon: typeof LayoutGrid }[] = [
  { section: 'zpravy', href: '/klient/zpravy', label: 'Zprávy', icon: MessagesSquare },
  { section: 'prehled', href: '/klient', label: 'Přehled', icon: LayoutGrid },
  { section: 'faktury', href: '/klient/faktury', label: 'Faktury', icon: Receipt },
  { section: 'konzultace', href: '/klient/konzultace', label: 'Konzultace', icon: CalendarClock },
]

export async function ClientShell({
  ctx,
  section,
  activeProjectId = null,
  fullScreenOnPhone = false,
  threads: given,
  children,
}: {
  ctx: PortalContext
  section: ClientSection
  activeProjectId?: string | null
  /** Chat na telefonu přes celou obrazovku, bez spodní lišty. */
  fullScreenOnPhone?: boolean
  /** Vlákna, když je stránka už načetla (přehled je potřebuje taky). */
  threads?: ChatThreadSummary[]
  children: React.ReactNode
}) {
  const threads = given ?? (await listClientThreads(ctx.clientId).catch(() => []))
  const unread = totalUnread(threads)

  return (
    <div className="flex h-dvh overflow-hidden bg-ground">
      <ChatLive
        stateUrl="/api/klient/zpravy/stav"
        projectId={activeProjectId ?? undefined}
        touch={activeProjectId ? touchThread : undefined}
        unread={unread}
      />

      <aside className="hidden w-72 shrink-0 flex-col border-r border-navy-100 bg-surface md:flex">
        <div className="border-b border-navy-100 px-4 py-3">
          <Link href="/klient" className="inline-flex min-h-11 items-center" aria-label="ZakazIQ, přehled">
            <Logo size={26} wordmark />
          </Link>
          <p className="truncate text-sm font-semibold text-ink">{ctx.clientName}</p>
        </div>
        <nav className="px-2 py-2" aria-label="Klientský prostor">
          {NAV.filter((n) => n.section !== 'zpravy').map((n) => (
            <Link
              key={n.section}
              href={n.href}
              aria-current={section === n.section ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-chip px-3 text-sm',
                section === n.section ? 'bg-navy-50 font-semibold text-ink' : 'text-quiet hover:bg-navy-50 hover:text-ink',
              )}
            >
              <n.icon size={17} strokeWidth={1.5} aria-hidden="true" />
              {n.label}
            </Link>
          ))}
        </nav>
        <p className="px-5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-quiet">Zakázky</p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ThreadList threads={threads} activeId={activeProjectId} hrefBase="/klient/zpravy" viewer="client" empty="Zatím tu žádná zakázka není." />
        </div>
        <div className="border-t border-navy-100 px-2 pt-2">
          <Link href="/klient/soukromi" className="flex min-h-11 w-full items-center rounded-chip px-3 text-sm text-quiet hover:bg-navy-50 hover:text-ink">
            Vaše údaje
          </Link>
        </div>
        <form action={signOutClient} className="p-2 pt-0">
          <button type="submit" className="flex min-h-11 w-full items-center rounded-chip px-3 text-sm text-quiet hover:bg-navy-50 hover:text-ink">
            Odhlásit
          </button>
        </form>
      </aside>

      <main className={cn('flex min-w-0 flex-1 flex-col', !fullScreenOnPhone && 'pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0')}>
        {children}
      </main>

      {!fullScreenOnPhone && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-navy-100 bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Klientský prostor"
        >
          {NAV.map((n) => (
            <Link
              key={n.section}
              href={n.href}
              aria-current={section === n.section ? 'page' : undefined}
              className={cn('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs', section === n.section ? 'font-semibold text-navy-700' : 'text-quiet')}
            >
              <n.icon size={20} strokeWidth={1.5} aria-hidden="true" />
              {n.label}
              {n.section === 'zpravy' && unread > 0 && (
                <span className="absolute right-[22%] top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-[11px] font-semibold text-signal-ink">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}

/** Hlavička obsahu na telefonu (logo a odhlášení), na počítači jen nadpis. */
export function ClientPageHeader({ title, clientName }: { title: string; clientName: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-navy-100 bg-surface px-4 py-3 md:px-6">
      <div className="min-w-0">
        <p className="truncate text-xs text-quiet md:hidden">{clientName}</p>
        <h1 className="truncate text-lg font-semibold text-ink md:text-xl">{title}</h1>
      </div>
      <form action={signOutClient} className="md:hidden">
        <button type="submit" className="inline-flex min-h-11 items-center rounded-chip px-3 text-sm text-quiet hover:bg-navy-50">
          Odhlásit
        </button>
      </form>
    </header>
  )
}
