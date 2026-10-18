'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { hrefWith } from '@/lib/ws/detail-param'

const pad = (n: number) => String(n).padStart(2, '0')

// Mini-měsíc (react-day-picker) se stáhne až při prvním otevření, ne s každým načtením Kalendáře.
const Calendar = dynamic(() => import('@/components/ui/calendar').then((m) => m.Calendar), {
  ssr: false,
  loading: () => <div className="h-[330px] w-[320px]" aria-hidden />,
})

/**
 * Nadpis zobrazeného období, který je zároveň skokem na datum: klik otevře
 * mini-měsíc, výběr dne přepne kalendář na něj (pohled Den/Týden/Měsíc zůstane).
 */
export function DateJump({
  label,
  date,
  pathname,
  params,
}: {
  label: string
  /** Den, na kterém je kalendář ('YYYY-MM-DD'). */
  date: string
  pathname: string
  /** Aktuální parametry adresy (pohled, pracovník…), `datum` a `detail` se přepíšou. */
  params: Record<string, string>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [y, m, d] = date.split('-').map(Number)
  const selected = new Date(y, m - 1, d)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. Přejít na jiné datum`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-num text-[15px] text-ink transition-colors first-letter:uppercase hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarDays aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-quiet" />
          <span className="first-letter:uppercase">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(day) => {
            if (!day) return
            setOpen(false)
            router.push(hrefWith(pathname, params, { datum: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`, detail: null }), {
              scroll: false,
            })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
