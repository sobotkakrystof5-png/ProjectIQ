'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/types'
import { cn } from '@/lib/utils'

const ALL = 'all'

export function DashboardFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? ALL

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === ALL) {
      params.delete('status')
    } else {
      params.set('status', value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const filters: { label: string; value: string }[] = [
    { label: 'Vše', value: ALL },
    ...STATUS_ORDER.map(s => ({ label: STATUS_LABELS[s], value: s })),
  ]

  return (
    <div className="flex gap-1.5 flex-wrap">
      {filters.map(f => (
        <button
          key={f.value}
          onClick={() => setFilter(f.value)}
          className={cn(
            'text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
            current === f.value
              ? 'bg-brand-800 text-white shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-brand-50 hover:text-brand-800'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
