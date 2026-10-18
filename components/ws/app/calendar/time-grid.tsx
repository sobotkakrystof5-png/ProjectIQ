'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { confirmRequest, moveAppointment } from '@/app/w/[business]/poptavky/actions'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/ws/utils'
import { undoToast, useWsAction } from '../booking/use-ws-action'

// Časová mřížka Kalendáře (S10, mockup C): sloupce = dny (Týden) nebo
// pracovníci (Den). Pozice spočítal server (lib/ws/calendar-layout.ts),
// tady je jen interakce: přetažení termínu (myší, se „Zpět“), klik do
// prázdného místa = nová rezervace, potvrzení poptávky na bloku.

export const HOUR_PX = 48
const SNAP_MIN = 15

export type GridColumn = {
  key: string
  day: string
  /** Pracovník sloupce v pohledu Den; `undefined` = přesun pracovníka nemění. */
  staffId?: string | null
  label: string
  sublabel?: string
  today?: boolean
  /** Sloupec nových poptávek — nedá se do něj nic přetáhnout ani kliknout. */
  requests?: boolean
}

export type GridItem = {
  key: string
  id: string
  kind: 'visit' | 'block' | 'request'
  column: string
  top: number
  height: number
  lane: number
  lanes: number
  title: string
  time: string
  label: string
  href: string
  /** Začátek v minutách dne (pro „Zpět“ a výpočet přesunu). */
  startMinutes: number
  movable: boolean
  /** Poptávka s chtěným časem — jde potvrdit přímo na bloku. */
  confirm?: { day: string; minutes: number }
  fresh?: boolean
}

const KIND_CLASS: Record<GridItem['kind'], string> = {
  visit: 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900 dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
  block: 'bg-navy-50 text-quiet dark:bg-navy-900 dark:text-navy-200',
  request: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
}

export function TimeGrid({
  slug,
  columns,
  items,
  hours,
  newBookingHref,
  className,
}: {
  slug: string
  columns: GridColumn[]
  items: GridItem[]
  hours: { from: number; to: number }
  /** Odkaz na Novou rezervaci bez parametrů dne/času; `null` = klik do mřížky nic nedělá. */
  newBookingHref: string | null
  className?: string
}) {
  const router = useRouter()
  // Blok otevřený v pravém panelu je zvýrazněný (R-057) — panel a mřížka k sobě patří.
  const openDetail = useSearchParams().get('detail')
  const { run, pending } = useWsAction()
  const height = (hours.to - hours.from) * HOUR_PX
  const span = (hours.to - hours.from) * 60
  const grab = useRef<{ id: string; offsetMin: number } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Přetažený termín zůstane na novém místě, než dorazí čerstvá data.
  const [moved, setMoved] = useState<Record<string, { column: string; top: number }>>({})
  useEffect(() => setMoved({}), [items])

  const minutesAt = (el: HTMLElement, clientY: number) => {
    const rect = el.getBoundingClientRect()
    const raw = hours.from * 60 + ((clientY - rect.top) / rect.height) * span
    return Math.round(raw / SNAP_MIN) * SNAP_MIN
  }

  const drop = (col: GridColumn, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setOver(null)
    const g = grab.current
    grab.current = null
    const item = g && items.find((i) => i.id === g.id && i.movable)
    if (!item || col.requests) return
    const minutes = Math.max(0, Math.min(1439, minutesAt(e.currentTarget, e.clientY) - g.offsetMin))
    const sameColumn = item.column === col.key
    if (sameColumn && minutes === item.startMinutes) return
    setMoved((m) => ({ ...m, [item.id]: { column: col.key, top: ((minutes - hours.from * 60) / span) * 100 } }))
    void run(
      () => moveAppointment({ slug, appointmentId: item.id, at: { day: col.day, minutes }, staffId: col.staffId ?? null }),
      (r) =>
        undoToast(r.message, () =>
          moveAppointment({ slug, appointmentId: item.id, at: { day: r.prev.day, minutes: r.prev.minutes }, staffId: r.prev.staffId }),
        { done: 'Termín je zpátky na původním místě.' }),
    ).then((ok) => {
      if (!ok) setMoved((m) => {
        const next = { ...m }
        delete next[item.id]
        return next
      })
    })
  }

  const clickEmpty = (col: GridColumn, e: React.MouseEvent<HTMLDivElement>) => {
    if (!newBookingHref || col.requests || e.target !== e.currentTarget) return
    const minutes = Math.floor(minutesAt(e.currentTarget, e.clientY) / 30) * 30
    const params = new URLSearchParams({ den: col.day, cas: String(minutes) })
    if (col.staffId) params.set('pracovnik', col.staffId)
    router.push(`${newBookingHref}&${params.toString()}`, { scroll: false })
  }

  const confirm = (item: GridItem) =>
    run(
      () => confirmRequest({ slug, requestId: item.id, at: null }),
      (r) => toast.success(r.message),
    )

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="grid min-w-[560px]" style={{ gridTemplateColumns: `44px repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div aria-hidden />
        {columns.map((c) => (
          <div key={c.key} className="flex min-w-0 flex-col items-center gap-0.5 px-1 pb-2 text-center">
            <span
              className={cn(
                'inline-flex min-h-7 max-w-full items-center truncate rounded-full px-2.5 text-[12px] font-semibold',
                c.today ? 'bg-navy-700 text-white' : c.requests ? 'bg-signal-bg text-signal-ink' : 'text-ink',
              )}
            >
              {c.label}
            </span>
            {c.sublabel && <span className="font-num text-[10px] uppercase tracking-[0.06em] text-quiet">{c.sublabel}</span>}
          </div>
        ))}

        <div className="relative" style={{ height }} aria-hidden>
          {Array.from({ length: hours.to - hours.from }, (_, i) => (
            <span key={i} className="absolute right-2 -translate-y-1/2 font-num text-[10px] text-quiet" style={{ top: i * HOUR_PX }}>
              {i === 0 ? '' : `${hours.from + i}:00`}
            </span>
          ))}
        </div>

        {columns.map((col) => {
          const colItems = items
            .map((it) => (moved[it.id] && it.movable ? { ...it, column: moved[it.id].column, top: moved[it.id].top, lane: 0, lanes: 1 } : it))
            .filter((it) => it.column === col.key)
          return (
            <div
              key={col.key}
              className={cn(
                'relative border-l transition-colors',
                col.today && 'bg-navy-50/60 dark:bg-navy-900/60',
                col.requests && 'bg-signal-bg/30',
                over === col.key && 'bg-navy-100/50 dark:bg-navy-800/50',
                newBookingHref && !col.requests && 'cursor-copy',
              )}
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px ${HOUR_PX}px)`,
              }}
              onClick={(e) => clickEmpty(col, e)}
              onDragOver={(e) => {
                if (col.requests || !grab.current) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== col.key) setOver(col.key)
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => drop(col, e)}
            >
              <ul aria-label={`${col.label}${col.sublabel ? ` ${col.sublabel}` : ''}`} className="contents">
                {colItems.map((it) => {
                  const px = (it.height / 100) * height
                  // potvrzovací tlačítko se vejde do bloku od ~40 px (40 min)
                  const roomy = px >= 40
                  const selected = openDetail !== null && new URLSearchParams(it.href.split('?')[1] ?? '').get('detail') === openDetail
                  return (
                    <li
                      key={it.key}
                      className={cn('absolute', it.fresh && 'animate-zq-in')}
                      style={{
                        top: `${it.top}%`,
                        height: `max(${it.height}%, 20px)`,
                        left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / it.lanes}% - 4px)`,
                      }}
                    >
                      <Link
                        href={it.href}
                        scroll={false}
                        aria-label={it.label}
                        aria-current={selected ? 'true' : undefined}
                        title={it.label}
                        draggable={it.movable}
                        onDragStart={(e) => {
                          if (!it.movable) return
                          const rect = e.currentTarget.getBoundingClientRect()
                          const offsetMin = Math.round((((e.clientY - rect.top) / height) * span) / SNAP_MIN) * SNAP_MIN
                          grab.current = { id: it.id, offsetMin }
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', it.title)
                        }}
                        onDragEnd={() => {
                          grab.current = null
                          setOver(null)
                        }}
                        className={cn(
                          'block h-full overflow-hidden rounded-tiny px-1.5 py-1 transition-[filter] duration-200 hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          KIND_CLASS[it.kind],
                          it.movable && 'cursor-grab active:cursor-grabbing',
                          it.confirm && roomy && 'pr-9',
                          selected && 'ring-2 ring-navy-700 ring-offset-1 ring-offset-surface dark:ring-navy-200',
                          pending && moved[it.id] && 'opacity-70',
                        )}
                      >
                        <span className="block truncate font-num text-[10px] leading-tight opacity-80">{it.time}</span>
                        {px >= 34 && <span className="block truncate text-[12px] font-semibold leading-tight">{it.title}</span>}
                      </Link>
                      {it.confirm && roomy && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void confirm(it)}
                          aria-label={`Potvrdit termín: ${it.title}`}
                          title="Potvrdit termín"
                          className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-navy-700 text-white shadow-sm hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        >
                          <Check aria-hidden size={15} strokeWidth={2} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="sr-only">Termín přesunete v jeho detailu tlačítkem Přesunout. Myší ho můžete přetáhnout.</p>
    </div>
  )
}
