'use client'

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { MAX_RANGES_PER_DAY, WEEKDAY_NAMES, clockToMinutes, minutesToClock, type HoursRange, type Week } from '@/lib/ws/hours'

const DEFAULT_RANGE: HoursRange = { opens: '09:00', closes: '17:00' }

/** Přestávka: den 9–17 rozdělí na 9–12 a 13–17, jinak přidá další úsek za poslední. */
function withBreak(ranges: HoursRange[]): HoursRange[] | null {
  const last = ranges[ranges.length - 1]
  const opens = clockToMinutes(last.opens) ?? 0
  const closes = clockToMinutes(last.closes) ?? 0
  if (ranges.length === 1 && opens < 12 * 60 && closes > 13 * 60) return [{ opens: last.opens, closes: '12:00' }, { opens: '13:00', closes: last.closes }]
  const start = closes + 30
  if (start + 30 > 1440) return null
  return [...ranges, { opens: minutesToClock(start), closes: minutesToClock(Math.min(1440, start + 120)) }]
}

// Týden po dnech: den zapnout / vypnout, časy od–do, přestávka. Ukládá rodič.
export function WeekHoursEditor({ value, onChange, disabled, idPrefix }: { value: Week; onChange: (next: Week) => void; disabled?: boolean; idPrefix: string }) {
  const setDay = (i: number, ranges: HoursRange[]) => onChange(value.map((d, j) => (j === i ? ranges : d)))
  const monday = value[0]
  const canCopy = monday.length > 0 && value.slice(1, 5).some((d) => JSON.stringify(d) !== JSON.stringify(monday))

  return <div className="flex flex-col gap-1">
    <ul className="flex flex-col divide-y divide-navy-100">
      {value.map((ranges, i) => {
        const open = ranges.length > 0
        const breakable = open && ranges.length < MAX_RANGES_PER_DAY && withBreak(ranges) !== null
        return <li key={WEEKDAY_NAMES[i]} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex min-h-11 items-center justify-between gap-3 sm:w-44 sm:shrink-0">
            <label htmlFor={`${idPrefix}-${i}`} className="text-[15px] font-medium text-ink">{WEEKDAY_NAMES[i]}</label>
            <span className="flex items-center gap-2 text-sm text-quiet">
              {open ? 'Otevřeno' : 'Zavřeno'}
              <Switch id={`${idPrefix}-${i}`} checked={open} disabled={disabled} onCheckedChange={(on) => setDay(i, on ? [i > 0 && value[i - 1].length ? value[i - 1][0] : DEFAULT_RANGE] : [])} />
            </span>
          </div>
          {open && <div className="flex flex-1 flex-col gap-2">
            {ranges.map((r, k) => <div key={k} className="flex items-center gap-2">
              <Input type="time" step={300} value={r.opens} disabled={disabled} aria-label={`${WEEKDAY_NAMES[i]}, od`} className="w-[120px] font-num" onChange={(e) => setDay(i, ranges.map((x, n) => (n === k ? { ...x, opens: e.target.value } : x)))} />
              <span className="text-quiet" aria-hidden>–</span>
              <Input type="time" step={300} value={r.closes === '24:00' ? '23:59' : r.closes} disabled={disabled} aria-label={`${WEEKDAY_NAMES[i]}, do`} className="w-[120px] font-num" onChange={(e) => setDay(i, ranges.map((x, n) => (n === k ? { ...x, closes: e.target.value } : x)))} />
              {ranges.length > 1 && <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Odebrat čas ${r.opens}–${r.closes}`} onClick={() => setDay(i, ranges.filter((_, n) => n !== k))}><X size={18} strokeWidth={1.5} /></Button>}
            </div>)}
            {breakable && <button type="button" disabled={disabled} className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 text-sm text-navy-500 hover:text-navy-700 disabled:opacity-50" onClick={() => { const next = withBreak(ranges); if (next) setDay(i, next) }}>
              <Plus size={16} strokeWidth={1.5} aria-hidden />{ranges.length === 1 ? 'Přidat přestávku' : 'Přidat další čas'}
            </button>}
          </div>}
        </li>
      })}
    </ul>
    {canCopy && <button type="button" disabled={disabled} className="inline-flex min-h-11 items-center self-start rounded-full px-2 text-sm text-navy-500 hover:text-navy-700 disabled:opacity-50" onClick={() => onChange(value.map((d, j) => (j >= 1 && j <= 4 ? monday.map((r) => ({ ...r })) : d)))}>
      Použít pondělí i na úterý až pátek
    </button>}
  </div>
}
