'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/ws/plural'
import { dayChip, dayLabel, groupSlotsByDay, slotMinutes, slotTime, type FreeSlot } from '@/lib/consultations/rules'

/**
 * Výběr času konzultace z volna (KP14): nahoře dny, které mají volno, pod nimi
 * časy vybraného dne. Stejný pro klientský prostor `/klient` i odkaz `/p`.
 * Nabízí jen časy, které vrátila databáze — kolizi stejně hlídá až rezervace.
 */
export function SlotPicker({
  slots,
  today,
  day,
  value,
  onDayChange,
  onChange,
}: {
  slots: FreeSlot[]
  /** Dnešní pražský den 'YYYY-MM-DD' ze serveru. */
  today: string
  day: string | null
  value: string | null
  onDayChange: (day: string) => void
  onChange: (startsAt: string) => void
}) {
  const days = useMemo(() => groupSlotsByDay(slots), [slots])
  const active = days.find((d) => d.day === day) ?? null

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Den</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const chip = dayChip(d.day)
            const selected = d.day === day
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => onDayChange(d.day)}
                aria-pressed={selected}
                aria-label={`${dayLabel(d.day, today)}, ${plural(d.slots.length, ['volný čas', 'volné časy', 'volných časů'])}`}
                className={cn(
                  'flex min-h-[56px] min-w-[64px] shrink-0 flex-col items-center justify-center rounded-chip border px-3 text-sm transition-colors',
                  selected
                    ? 'border-transparent bg-navy-700 text-white'
                    : 'border-navy-100 bg-surface text-ink hover:border-navy-300',
                )}
              >
                <span className={cn('text-xs', selected ? 'text-white/80' : 'text-quiet')}>
                  {d.day === today ? 'dnes' : chip.weekday}
                </span>
                <span className="font-num font-semibold">{chip.date}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {active && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            Čas, {dayLabel(active.day, today)}
            <span className="ml-1 font-normal text-quiet">· {slotMinutes(active.slots[0])} minut</span>
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {active.slots.map((slot) => {
              const selected = slot.startsAt === value
              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => onChange(slot.startsAt)}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-[44px] rounded-chip border font-num text-sm font-semibold transition-colors',
                    selected
                      ? 'border-transparent bg-navy-700 text-white'
                      : 'border-navy-100 bg-surface text-navy-800 hover:border-navy-300',
                  )}
                >
                  {slotTime(slot.startsAt)}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )
}
