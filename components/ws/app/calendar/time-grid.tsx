'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { confirmRequest, moveAppointment, resizeAppointment } from '@/app/w/[business]/poptavky/actions'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { toast } from '@/components/ui/toast'
import { NowIndicator } from '@/components/ws/app/calendar/now-indicator'
import { staffTint } from '@/lib/ws/staff-colors'
import { pointerDragStarted } from '@/lib/ws/calendar-indicator'
import { cn } from '@/lib/ws/utils'
import type { QuickBookingStart } from '../booking/quick-booking'
import { undoToast, useWsAction } from '../booking/use-ws-action'

// Časová mřížka Kalendáře (S10, mockup C, RD05): sloupce = dny (Týden) nebo
// pracovníci (Den). Pozici položek spočítal server (lib/ws/calendar-layout.ts),
// tady je jen interakce:
//  - klik nebo tažení v prázdném místě otevře rychlé zadání rezervace,
//  - přetažení termínu myší, perem nebo dotykem (se „Zpět“),
//  - tažení za spodní okraj změní délku (se „Zpět“),
//  - potvrzení poptávky na bloku.
// Přesun i změna délky se v mřížce ukážou hned (optimisticky) a bez druhého
// načtení stránky; selže-li zápis, blok se vrátí a toast řekne proč.

// Rychlé zadání se načte až při prvním kliknutí do mřížky (zákazník, rady k času, akce).
const QuickBooking = dynamic(() => import('../booking/quick-booking').then((m) => m.QuickBooking), {
  ssr: false,
  loading: () => <div className="h-[420px]" aria-hidden />,
})

export const HOUR_PX = 48
const SNAP_MIN = 15
/** Pod tuhle vzdálenost (px) je to klik, ne tažení výběru. */
const DRAG_THRESHOLD_PX = 8

export type GridSegment = { top: number; height: number }

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
  /** Barva pracovníka (tečka v záhlaví). */
  accent?: string
  /** Doba mimo otevírací dobu (v % výšky). */
  closed?: GridSegment[]
  /** Velké volné mezery uvnitř otevírací doby (v % výšky) s popiskem „volno 2 h“. */
  gaps?: (GridSegment & { label: string })[]
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
  /** Skutečná délka v minutách (pro změnu délky tažením). */
  durationMin: number
  movable: boolean
  /** Jde změnit délku tažením za spodní okraj. */
  resizable: boolean
  /** Poptávka s chtěným časem — jde potvrdit přímo na bloku. */
  confirm?: { day: string; minutes: number }
  /** Barva pracovníka (CSS barva); bez ní platí výchozí vzhled termínu. */
  accent?: string
  fresh?: boolean
}

const KIND_CLASS: Record<GridItem['kind'], string> = {
  visit: 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900 dark:border-navy-300 dark:bg-navy-800 dark:text-navy-50',
  block: 'bg-navy-50 text-quiet dark:bg-navy-900 dark:text-navy-200',
  request: 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
}

const HATCH = 'repeating-linear-gradient(135deg, hsl(var(--border)) 0 1px, transparent 1px 7px)'

type Selection = { colKey: string; from: number; to: number }
type Quick = { col: GridColumn; range: Selection; start: QuickBookingStart }
type AppointmentDrag = {
  item: GridItem
  pointerId: number
  startX: number
  startY: number
  offsetMin: number
  started: boolean
}

export function TimeGrid({
  slug,
  columns,
  items,
  hours,
  newBookingHref,
  services,
  staff,
  canCreateGroupSessions,
  today,
  settingsHref,
  className,
}: {
  slug: string
  columns: GridColumn[]
  items: GridItem[]
  hours: { from: number; to: number }
  /** Odkaz na Novou rezervaci bez parametrů dne/času; `null` = klik do mřížky nic nedělá. */
  newBookingHref: string | null
  services: { id: string; name: string; duration_min: number }[]
  staff: { id: string; name: string }[]
  canCreateGroupSessions: boolean
  today: string
  /** Kam vede odkaz „nastavte otevírací dobu“ v rychlém zadání. */
  settingsHref: string
  className?: string
}) {
  // Blok otevřený v pravém panelu je zvýrazněný (R-057) — panel a mřížka k sobě patří.
  const openDetail = useSearchParams().get('detail')
  const { run, pending } = useWsAction()
  const height = (hours.to - hours.from) * HOUR_PX
  const span = (hours.to - hours.from) * 60
  const appointmentDrag = useRef<AppointmentDrag | null>(null)
  const suppressClick = useRef(false)
  const [over, setOver] = useState<string | null>(null)
  // Přetažený nebo natažený termín zůstane na novém místě, než dorazí čerstvá data.
  const [moved, setMoved] = useState<Record<string, { column: string; top: number }>>({})
  const [resized, setResized] = useState<Record<string, number>>({})
  useEffect(() => {
    setMoved({})
    setResized({})
  }, [items])

  // Výběr v prázdné mřížce (klik / tažení) a z něj rychlé zadání.
  const pick = useRef<{ col: GridColumn; el: HTMLElement; startY: number; from: number; dragging: boolean; range: Selection | null } | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [quick, setQuick] = useState<Quick | null>(null)
  const [touchSelect, setTouchSelect] = useState(false)
  const [touchMove, setTouchMove] = useState(false)
  const box = quick?.range ?? selection

  const rawMinutes = (el: HTMLElement, clientY: number) => {
    const rect = el.getBoundingClientRect()
    return hours.from * 60 + ((clientY - rect.top) / rect.height) * span
  }
  const minutesAt = (el: HTMLElement, clientY: number) => Math.round(rawMinutes(el, clientY) / SNAP_MIN) * SNAP_MIN
  const clampMin = (m: number) => Math.max(hours.from * 60, Math.min(hours.to * 60, m))

  const commitMove = (item: GridItem, col: GridColumn, minutes: number) => {
    const sameColumn = item.column === col.key
    if (sameColumn && minutes === item.startMinutes) return
    setMoved((m) => ({ ...m, [item.id]: { column: col.key, top: ((minutes - hours.from * 60) / span) * 100 } }))
    void run(
      () => moveAppointment({ slug, appointmentId: item.id, at: { day: col.day, minutes }, staffId: col.staffId ?? null }),
      (r) =>
        undoToast(r.message, () =>
          moveAppointment({ slug, appointmentId: item.id, at: { day: r.prev.day, minutes: r.prev.minutes }, staffId: r.prev.staffId }),
        { done: 'Termín je zpátky na původním místě.' }),
      { refresh: false },
    ).then((ok) => {
      if (!ok) setMoved((m) => {
        const next = { ...m }
        delete next[item.id]
        return next
      })
    })
  }

  const pointerColumn = (x: number, y: number) => {
    const target = document.elementFromPoint(x, y)
    const columnElement = target instanceof Element ? target.closest<HTMLElement>('[data-calendar-column]') : null
    const key = columnElement?.dataset.calendarColumn
    const col = key ? columns.find((candidate) => candidate.key === key) : undefined
    return columnElement && col && !col.requests ? { col, element: columnElement } : null
  }

  const startAppointmentDrag = (item: GridItem, e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!item.movable || e.button !== 0 || (e.pointerType === 'touch' && !touchMove)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetMin = Math.max(0, Math.min(item.durationMin, Math.round((((e.clientY - rect.top) / Math.max(rect.height, 1)) * item.durationMin) / SNAP_MIN) * SNAP_MIN))
    appointmentDrag.current = { item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, offsetMin, started: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const moveAppointmentPointer = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const drag = appointmentDrag.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (!drag.started && !pointerDragStarted(drag.startX, drag.startY, e.clientX, e.clientY, DRAG_THRESHOLD_PX)) return
    drag.started = true
    const target = pointerColumn(e.clientX, e.clientY)
    if (!target) {
      setOver(null)
      setMoved((current) => {
        const next = { ...current }
        delete next[drag.item.id]
        return next
      })
      return
    }
    const minutes = Math.max(0, Math.min(1439, minutesAt(target.element, e.clientY) - drag.offsetMin))
    setOver(target.col.key)
    setMoved((current) => ({ ...current, [drag.item.id]: { column: target.col.key, top: ((minutes - hours.from * 60) / span) * 100 } }))
  }

  const finishAppointmentDrag = (e: React.PointerEvent<HTMLAnchorElement>, cancelled = false) => {
    const drag = appointmentDrag.current
    if (!drag || drag.pointerId !== e.pointerId) return
    appointmentDrag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setOver(null)
    if (!drag.started) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    if (cancelled) {
      setMoved((current) => {
        const next = { ...current }
        delete next[drag.item.id]
        return next
      })
      return
    }
    const target = pointerColumn(e.clientX, e.clientY)
    const drop = target
      ? { col: target.col, minutes: Math.max(0, Math.min(1439, minutesAt(target.element, e.clientY) - drag.offsetMin)) }
      : null
    if (!drop) {
      setMoved((current) => {
        const next = { ...current }
        delete next[drag.item.id]
        return next
      })
      return
    }
    commitMove(drag.item, drop.col, drop.minutes)
  }

  // --- Výběr v prázdné mřížce ---------------------------------------------------

  const canPick = (col: GridColumn) => newBookingHref !== null && !col.requests

  const pickDown = (col: GridColumn, e: React.PointerEvent<HTMLDivElement>) => {
    if (!canPick(col) || e.button !== 0 || e.target !== e.currentTarget) return
    const el = e.currentTarget
    pick.current = { col, el, startY: e.clientY, from: clampMin(minutesAt(el, e.clientY)), dragging: false, range: null }
    // Dotyk si běžně nechává posouvání stránky; tažení povolí až výslovný režim.
    if (e.pointerType !== 'touch' || touchSelect) el.setPointerCapture(e.pointerId)
  }

  const pickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pick.current
    if (!p || (e.pointerType === 'touch' && !touchSelect)) return
    if (!p.dragging && Math.abs(e.clientY - p.startY) < DRAG_THRESHOLD_PX) return
    p.dragging = true
    const now = clampMin(minutesAt(p.el, e.clientY))
    const from = Math.min(p.from, now)
    const to = Math.max(p.from, now)
    const range = { colKey: p.col.key, from, to: Math.max(to, from + SNAP_MIN) }
    p.range = range
    setSelection(range)
  }

  const pickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pick.current
    pick.current = null
    if (!p) return
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    let range: Selection
    let durationMin: number | null = null
    if (p.dragging && p.range) {
      range = p.range
      durationMin = p.range.to - p.range.from
    } else {
      // Klik: půlhodinový začátek (jako dřív), délku určí služba.
      const from = Math.max(hours.from * 60, Math.min(hours.to * 60 - 30, Math.floor(rawMinutes(p.el, e.clientY) / 30) * 30))
      range = { colKey: p.col.key, from, to: from + 30 }
    }
    setSelection(null)
    setQuick({
      col: p.col,
      range,
      start: { day: p.col.day, minutes: range.from, staffId: p.col.staffId ?? null, durationMin },
    })
    if (touchSelect) setTouchSelect(false)
  }

  const pickCancel = () => {
    pick.current = null
    setSelection(null)
    if (touchSelect) setTouchSelect(false)
  }

  const fullFormHref = (s: { name: string; customerId: string; day: string; minutes: number; serviceName: string; staffId: string }) => {
    const params = new URLSearchParams({ den: s.day, cas: String(s.minutes) })
    if (s.customerId) params.set('zakaznik', s.customerId)
    if (s.name) params.set('kdo', s.name.slice(0, 80))
    if (s.serviceName) params.set('sluzba', s.serviceName)
    if (s.staffId) params.set('pracovnik', s.staffId)
    return `${newBookingHref}&${params.toString()}`
  }

  // --- Změna délky tažením za spodní okraj -----------------------------------------

  const resizing = useRef<{ item: GridItem; startY: number; startDur: number; maxDur: number; dur: number } | null>(null)

  const resizeDown = (item: GridItem, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startDur = resized[item.id] ?? item.durationMin
    const maxDur = Math.max(SNAP_MIN, Math.min(720, hours.to * 60 - item.startMinutes))
    resizing.current = { item, startY: e.clientY, startDur, maxDur, dur: startDur }
  }

  const resizeMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = resizing.current
    if (!r) return
    const delta = ((e.clientY - r.startY) / HOUR_PX) * 60
    const dur = Math.max(SNAP_MIN, Math.min(r.maxDur, Math.round((r.startDur + delta) / SNAP_MIN) * SNAP_MIN))
    r.dur = dur
    setResized((m) => (m[r.item.id] === dur ? m : { ...m, [r.item.id]: dur }))
  }

  const resizeUp = (e: React.PointerEvent<HTMLElement>) => {
    const r = resizing.current
    resizing.current = null
    if (!r) return
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const { item, dur } = r
    if (dur === item.durationMin) {
      setResized((m) => {
        const next = { ...m }
        delete next[item.id]
        return next
      })
      return
    }
    void run(
      () => resizeAppointment({ slug, appointmentId: item.id, durationMin: dur }),
      (res) =>
        undoToast(res.message, () => resizeAppointment({ slug, appointmentId: item.id, durationMin: res.prevDurationMin }), {
          done: 'Délka je zpátky.',
        }),
      { refresh: false },
    ).then((ok) => {
      if (!ok)
        setResized((m) => {
          const next = { ...m }
          delete next[item.id]
          return next
        })
    })
  }

  const confirm = (item: GridItem) =>
    run(
      () => confirmRequest({ slug, requestId: item.id, at: null }),
      (r) => toast.success(r.message),
    )

  return (
    <Popover open={quick !== null} onOpenChange={(o) => !o && setQuick(null)}>
      <div className={cn('overflow-x-auto', className)}>
        <div className="calendar-touch-select-control sticky left-0 z-30 mb-3 w-fit flex-wrap items-center gap-2 rounded-box bg-surface">
          <Button
            variant="outline"
            aria-pressed={touchSelect}
            onClick={() => {
              pick.current = null
              setSelection(null)
              if (!touchSelect) setTouchMove(false)
              setTouchSelect((active) => !active)
            }}
          >
            {touchSelect ? 'Zrušit výběr' : 'Vybrat dobu'}
          </Button>
          <Button
            variant="outline"
            aria-pressed={touchMove}
            onClick={() => {
              if (!touchMove) setTouchSelect(false)
              setTouchMove((active) => !active)
            }}
          >
            {touchMove ? 'Zrušit přesun' : 'Přesouvat termíny'}
          </Button>
          {(touchSelect || touchMove) && (
            <p role="status" className="text-sm text-quiet">
              {touchMove
                ? 'Podržte termín a přetáhněte ho na nový čas. Když režim vypnete, stránku můžete běžně posouvat.'
                : 'Táhněte prstem od začátku do konce; krátký dotyk vybere začátek a délku určí služba.'}
            </p>
          )}
        </div>
        <div className="grid min-w-[560px]" style={{ gridTemplateColumns: `44px repeat(${columns.length}, minmax(0, 1fr))` }}>
          <div aria-hidden />
          {columns.map((c) => (
            <div key={c.key} className="flex min-w-0 flex-col items-center gap-0.5 px-1 pb-2 text-center">
              <span
                className={cn(
                  'inline-flex min-h-7 max-w-full items-center gap-1.5 truncate rounded-full px-2.5 text-[12px] font-semibold',
                  c.today ? 'bg-navy-700 text-white' : c.requests ? 'bg-signal-bg text-signal-ink' : 'text-ink',
                )}
              >
                {c.accent && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.accent }} />}
                <span className="truncate">{c.label}</span>
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
            const colBox = box && box.colKey === col.key ? box : null
            return (
              <div
                key={col.key}
                className={cn(
                  'relative border-l transition-colors',
                  col.today && 'bg-navy-50/60 dark:bg-navy-900/60',
                  col.requests && 'bg-signal-bg/30',
                  over === col.key && 'bg-navy-100/50 dark:bg-navy-800/50',
                  canPick(col) && 'cursor-cell',
                  canPick(col) && touchSelect && 'touch-pan-x',
                )}
                style={{
                  height,
                  backgroundImage: `repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px ${HOUR_PX}px)`,
                }}
                onPointerDown={(e) => pickDown(col, e)}
                onPointerMove={pickMove}
                onPointerUp={pickUp}
                onPointerCancel={pickCancel}
                data-calendar-column={col.key}
                onPointerLeave={() => setOver((o) => (o === col.key ? null : o))}
              >
                {!col.requests && (
                  <NowIndicator day={col.day} hours={hours} showLabel={columns[0]?.key === col.key} />
                )}
                {col.closed?.map((seg, i) => (
                  <div
                    key={`z${i}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bg-navy-50/70 dark:bg-navy-950/40"
                    style={{ top: `${seg.top}%`, height: `${seg.height}%`, backgroundImage: HATCH }}
                  />
                ))}
                {col.gaps?.map((gap, i) => (
                  <div
                    key={`m${i}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 flex items-start justify-center rounded-tiny bg-navy-100/30 pt-1 dark:bg-navy-800/40"
                    style={{ top: `${gap.top}%`, height: `${gap.height}%` }}
                  >
                    <span className="font-num text-[10px] text-quiet">{gap.label}</span>
                  </div>
                ))}

                {colBox && (
                  <PopoverAnchor asChild>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0.5 rounded-tiny border-[1.5px] border-navy-500 bg-navy-700/15 dark:bg-navy-300/20"
                      style={{
                        top: `${((colBox.from - hours.from * 60) / span) * 100}%`,
                        height: `${((colBox.to - colBox.from) / span) * 100}%`,
                      }}
                    />
                  </PopoverAnchor>
                )}

                <ul aria-label={`${col.label}${col.sublabel ? ` ${col.sublabel}` : ''}`} className="contents">
                  {colItems.map((it) => {
                    const duration = resized[it.id]
                    const pct = duration !== undefined ? (duration / span) * 100 : it.height
                    const px = (pct / 100) * height
                    // potvrzovací tlačítko se vejde do bloku od ~40 px (40 min)
                    const roomy = px >= 40
                    const selected = openDetail !== null && new URLSearchParams(it.href.split('?')[1] ?? '').get('detail') === openDetail
                    const tinted = it.kind === 'visit' && it.accent
                    const dragHandlers = it.movable ? {
                      onPointerDown: (event: React.PointerEvent<HTMLAnchorElement>) => startAppointmentDrag(it, event),
                      onPointerMove: moveAppointmentPointer,
                      onPointerUp: (event: React.PointerEvent<HTMLAnchorElement>) => finishAppointmentDrag(event),
                      onPointerCancel: (event: React.PointerEvent<HTMLAnchorElement>) => finishAppointmentDrag(event, true),
                      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
                        if (!suppressClick.current) return
                        suppressClick.current = false
                        event.preventDefault()
                        event.stopPropagation()
                      },
                    } : {}
                    return (
                      <li
                        key={it.key}
                        className={cn('group/item absolute', it.fresh && 'animate-zq-in')}
                        style={{
                          top: `${it.top}%`,
                          height: duration !== undefined ? `${pct}%` : `max(${it.height}%, 20px)`,
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
                          {...dragHandlers}
                          className={cn(
                            'block h-full overflow-hidden rounded-tiny px-1.5 py-1 transition-[filter] duration-200 hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            KIND_CLASS[it.kind],
                            tinted && 'text-navy-900 dark:text-navy-50',
                            it.movable && 'cursor-grab active:cursor-grabbing',
                            it.confirm && roomy && 'pr-9',
                            selected && 'ring-2 ring-navy-700 ring-offset-1 ring-offset-surface dark:ring-navy-200',
                            pending && moved[it.id] && 'opacity-70',
                          )}
                          style={{
                            ...(tinted ? { borderLeftColor: it.accent, backgroundColor: staffTint(it.accent!) } : {}),
                            ...(touchMove && it.movable ? { touchAction: 'none' } : {}),
                          }}
                        >
                          {px >= 34 ? <>
                            <span className="block truncate font-num text-[10px] leading-tight opacity-80">{it.time}</span>
                            <span className="block truncate text-[12px] font-semibold leading-tight">{it.title}</span>
                          </> : (
                            // krátký termín (30 min): název přednostně, čas za ním na stejném řádku
                            <span className="block truncate text-[11px] leading-tight">
                              <span className="font-semibold">{it.title}</span> <span className="font-num text-[10px] opacity-80">{it.time}</span>
                            </span>
                          )}
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
                        {it.resizable && px >= 24 && (
                          <span
                            aria-hidden
                            title="Tažením změníte délku"
                            onPointerDown={(e) => resizeDown(it, e)}
                            onPointerMove={resizeMove}
                            onPointerUp={resizeUp}
                            onPointerCancel={resizeUp}
                            className="absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize touch-none items-end justify-center"
                          >
                            <span className="mb-0.5 h-[3px] w-8 rounded-full bg-current opacity-0 transition-opacity group-hover/item:opacity-40" />
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="sr-only">
          Termín přesunete v jeho detailu tlačítkem Přesunout, délku změníte tamtéž. Myší nebo perem ho můžete přetáhnout a za spodní okraj natáhnout.
          Na dotykové obrazovce zapněte Přesouvat termíny. Novou rezervaci založíte tlačítkem Nová rezervace.
        </p>
      </div>

      {quick && (
        <PopoverContent
          side="right"
          align="start"
          collisionPadding={12}
          className="w-[360px] max-w-[calc(100vw-24px)]"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            document.getElementById('rychla-zakaznik')?.focus()
          }}
        >
          <QuickBooking
            key={`${quick.col.key}-${quick.range.from}-${quick.range.to}`}
            slug={slug}
            services={services}
            staff={staff}
            canCreateGroupSessions={canCreateGroupSessions}
            today={today}
            start={quick.start}
            fullFormHref={fullFormHref}
            settingsHref={settingsHref}
            onClose={() => setQuick(null)}
          />
        </PopoverContent>
      )}
    </Popover>
  )
}
