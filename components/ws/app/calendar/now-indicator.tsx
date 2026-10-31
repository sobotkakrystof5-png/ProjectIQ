'use client'

import { useSyncExternalStore } from 'react'
import { formatMinutes, pragueParts } from '@/lib/ws/time'
import { nowLinePosition } from '@/lib/ws/calendar-indicator'

type PragueNow = ReturnType<typeof pragueParts>

const listeners = new Set<() => void>()
let current: PragueNow | null = null
let timer: number | undefined
let onVisibilityChange: (() => void) | undefined

function notify() {
  const next = pragueParts(new Date())
  if (current?.date === next.date && current.minutes === next.minutes) return
  current = next
  for (const listener of listeners) listener()
}

function schedule() {
  timer = window.setTimeout(() => {
    notify()
    schedule()
  }, 60_000 - (Date.now() % 60_000))
}

function refresh() {
  if (timer !== undefined) window.clearTimeout(timer)
  notify()
  schedule()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    refresh()
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange)
      onVisibilityChange = undefined
      current = null
    }
  }
}

const getSnapshot = () => current
const getServerSnapshot = () => null

/** Current-time marker for one day/staff column in the day or week grid. */
export function NowIndicator({
  day,
  hours,
  showLabel,
}: {
  day: string
  hours: { from: number; to: number }
  showLabel: boolean
}) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const top = nowLinePosition(now, day, hours)
  if (top === null || !now) return null
  const time = formatMinutes(now.minutes)

  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: `${top}%` }}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-navy-500 dark:border-navy-300" />
      <span
        aria-hidden="true"
        className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-navy-700 ring-2 ring-surface dark:bg-navy-200 dark:ring-navy-900"
      />
      {showLabel && (
        <>
          <span
            aria-hidden="true"
            className="absolute right-full -top-2.5 mr-1 rounded-full border border-navy-100 bg-surface px-1.5 py-0.5 font-num text-[10px] leading-none text-navy-700 shadow-sm dark:border-navy-800 dark:bg-navy-950 dark:text-navy-200"
          >
            {time}
          </span>
          <span className="sr-only">Teď je {time}.</span>
        </>
      )}
    </div>
  )
}
