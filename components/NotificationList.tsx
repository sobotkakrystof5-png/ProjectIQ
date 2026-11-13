'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar, Star, ClipboardList, Inbox, ArrowRightLeft, Bell,
  CheckCheck, ExternalLink, Sparkles, FileText, MessageSquarePlus,
} from 'lucide-react'
import { markNotificationRead, markAllNotificationsRead } from '@/app/notification-actions'
import { cn } from '@/lib/utils'
import type { Notification } from '@/app/dashboard/notifications/page'
import type { NotificationType } from '@/lib/notifications'

/** Druh oznámení je kategorie, ne stav — tón proto nenese (R-091). */
const ICON = 'text-navy-600 bg-navy-50'

const TYPE_META: Record<NotificationType, { icon: React.ElementType; color: string; label: string }> = {
  consultation_booked:   { icon: Calendar,         color: ICON,    label: 'Nová rezervace' },
  feedback_submitted:    { icon: Star,              color: ICON,  label: 'Hodnocení NPS' },
  survey_submitted:      { icon: ClipboardList,     color: ICON, label: 'Dotazník' },
  web_lead:              { icon: Inbox,             color: ICON,  label: 'Poptávka z webu' },
  // Staré řádky před sloučením inboxů (AD02) — nové se s těmito typy nezakládají.
  vizeon_booking:        { icon: Inbox,             color: ICON,  label: 'Poptávka z vizeon.cz' },
  alteno_booking:        { icon: Inbox,             color: ICON,  label: 'Poptávka z alteno.cz' },
  project_status_changed:{ icon: ArrowRightLeft,    color: ICON, label: 'Stav zakázky' },
  reminder_upcoming:     { icon: Bell,              color: ICON, label: 'Připomínka' },
  agent_lead_received:   { icon: Sparkles,          color: ICON,    label: 'AI lead' },
  invoice_received:      { icon: FileText,          color: ICON, label: 'Nová faktura' },
  client_request_received: { icon: MessageSquarePlus, color: ICON, label: 'Požadavek klienta' },
  activity_draft:        { icon: ClipboardList,     color: ICON, label: 'Hlášení ke schválení' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'právě teď'
  if (mins < 60) return `před ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `před ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `před ${days} d`
  return new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function groupByDay(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Dnes', items: [] },
    { label: 'Včera', items: [] },
    { label: 'Tento týden', items: [] },
    { label: 'Starší', items: [] },
  ]

  for (const n of notifications) {
    const d = new Date(n.created_at)
    d.setHours(0, 0, 0, 0)
    if (d >= today) groups[0].items.push(n)
    else if (d >= yesterday) groups[1].items.push(n)
    else if (d >= weekAgo) groups[2].items.push(n)
    else groups[3].items.push(n)
  }

  return groups.filter(g => g.items.length > 0)
}

function NotificationItem({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  const meta = TYPE_META[n.type] ?? TYPE_META.reminder_upcoming
  const Icon = meta.icon

  function handleClick() {
    if (!n.read) onRead(n.id)
    if (n.link) window.location.href = n.link
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-start gap-3 px-4 py-3.5 rounded-chip border transition-colors',
        n.link ? 'cursor-pointer hover:bg-navy-50/50' : 'cursor-default',
        n.read
          ? 'bg-surface border-navy-100'
          : 'bg-navy-50/30 border-navy-200',
      )}
    >
      <div className={cn('w-9 h-9 rounded-chip flex items-center justify-center shrink-0 mt-0.5', meta.color)}>
        <Icon size={16} strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-snug', n.read ? 'text-ink' : 'text-ink font-semibold')}>
            {n.title}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {!n.read && <span className="w-2 h-2 rounded-full bg-navy-500 shrink-0" />}
            <span className="text-[11px] text-quiet whitespace-nowrap">{timeAgo(n.created_at)}</span>
          </div>
        </div>
        {n.body && (
          <p className="text-xs text-quiet mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.color)}>
            {meta.label}
          </span>
          {n.link && (
            <span className="text-[10px] text-quiet flex items-center gap-0.5">
              <ExternalLink size={9} strokeWidth={1.5} />
              otevřít
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const unreadCount = notifications.filter(n => !n.read).length
  const groups = groupByDay(notifications)

  function handleRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id)
      router.refresh()
    })
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead()
      router.refresh()
    })
  }

  if (notifications.length === 0) {
    return (
      <div className="bg-surface border border-navy-100 rounded-box p-12 text-center">
        <div className="w-12 h-12 bg-navy-50 rounded-box flex items-center justify-center mx-auto mb-3">
          <Bell size={20} strokeWidth={1.5} className="text-navy-400" />
        </div>
        <p className="font-medium text-ink">Zatím žádná oznámení</p>
        <p className="text-sm text-quiet mt-1">Aktivity klientů se zobrazí zde</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-quiet">
            {unreadCount} nepřečtených
          </span>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={isPending}
            className="flex items-center gap-1.5 text-sm font-medium text-navy-800 hover:text-navy-600 disabled:opacity-50 transition-colors"
          >
            <CheckCheck size={15} strokeWidth={1.5} />
            Označit vše jako přečtené
          </button>
        </div>
      )}

      {groups.map(group => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-quiet uppercase tracking-wider mb-2 px-1">
            {group.label}
          </p>
          <div className="space-y-1.5">
            {group.items.map(n => (
              <NotificationItem key={n.id} n={n} onRead={handleRead} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
