'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMinutes } from '@/lib/ws/time'
import { cn } from '@/lib/ws/utils'

/** „9:30“ → 570. Neplatný čas = null. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

/** 570 → „09:30“ pro <input type="time">. */
export const clockValue = (minutes: number) => formatMinutes(minutes).padStart(5, '0')

/** Den a čas vedle sebe (nativní výběr — na telefonu se otevře systémový). */
export function WhenFields({
  idPrefix,
  day,
  time,
  onDay,
  onTime,
  dayLabel = 'Den',
  timeLabel = 'Čas',
  hideTime = false,
  className,
}: {
  idPrefix: string
  day: string
  time: string
  onDay: (v: string) => void
  onTime: (v: string) => void
  dayLabel?: string
  timeLabel?: string
  hideTime?: boolean
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_120px] gap-3', hideTime && 'grid-cols-1', className)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-den`}>{dayLabel}</Label>
        <Input id={`${idPrefix}-den`} type="date" value={day} onChange={(e) => onDay(e.target.value)} required className="font-num" />
      </div>
      {!hideTime && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-cas`}>{timeLabel}</Label>
          <Input
            id={`${idPrefix}-cas`}
            type="time"
            step={300}
            value={time}
            onChange={(e) => onTime(e.target.value)}
            required
            className="font-num"
          />
        </div>
      )}
    </div>
  )
}

/** Výběr pracovníka — jen když jich je víc (jinak ho nikdo nevybírá). */
export function StaffSelect({
  id,
  staff,
  value,
  onChange,
  emptyLabel,
}: {
  id: string
  staff: { id: string; name: string }[]
  value: string
  onChange: (v: string) => void
  emptyLabel: string
}) {
  if (staff.length < 2) return null
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Kdo</Label>
      <NativeSelect id={id} value={value} onChange={onChange}>
        <option value="">{emptyLabel}</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

/** Nativní select ve stylu Input (spolehlivý na telefonu, bez portálu). */
export function NativeSelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-chip border border-input bg-surface px-3 text-[15px] text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  )
}
