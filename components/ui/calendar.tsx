'use client'

import * as React from 'react'
import { DayPicker, type ChevronProps } from 'react-day-picker'
import { cs } from 'react-day-picker/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/ws/utils'

// Výběr data — česky, týden od pondělí, dny jako dílky (rounded-tiny), 44 px.

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
  return <Icon className={className} size={18} strokeWidth={1.5} />
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={cs}
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        root: 'relative w-fit',
        months: 'relative flex flex-col gap-6 sm:flex-row',
        month: 'flex flex-col gap-3',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous:
          'flex h-11 w-11 items-center justify-center rounded-full text-quiet transition-colors hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
        button_next:
          'flex h-11 w-11 items-center justify-center rounded-full text-quiet transition-colors hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
        month_caption: 'flex h-11 items-center justify-center',
        caption_label: 'text-[15px] font-semibold first-letter:uppercase',
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-11 pb-1 font-num text-[11px] font-normal uppercase tracking-[0.06em] text-quiet',
        week: 'mt-1 flex',
        day: 'relative p-0 text-center',
        day_button:
          'flex h-11 w-11 items-center justify-center rounded-tiny font-num text-sm text-ink transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        today: '[&>button]:font-semibold [&>button]:text-navy-700 [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-navy-100 dark:[&>button]:text-navy-200 dark:[&>button]:ring-navy-700',
        selected:
          '[&>button]:bg-navy-700 [&>button]:text-white [&>button]:hover:bg-navy-800 [&>button]:ring-0',
        outside: '[&>button]:text-quiet',
        disabled: '[&>button]:pointer-events-none [&>button]:text-quiet/40',
        range_middle: '[&>button]:rounded-none [&>button]:bg-navy-100 [&>button]:text-navy-900',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{ Chevron: CalendarChevron }}
      {...props}
    />
  )
}

export { Calendar }
