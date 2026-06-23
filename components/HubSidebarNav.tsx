'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, GraduationCap, TrendingUp, Dumbbell, Briefcase, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

const OVERVIEW = {
  href: '/hub',
  label: 'Přehled',
  icon: LayoutGrid,
}

const PILLARS = [
  {
    href: '/hub/finance',
    label: 'Finance',
    icon: TrendingUp,
    activeText: 'text-emerald-700',
    activeBg: 'bg-emerald-50',
    hoverBg: 'hover:bg-emerald-50/60',
    hoverText: 'hover:text-emerald-700',
    dot: 'bg-emerald-500',
    mobileDot: 'border-b-2 border-emerald-500 text-emerald-700',
  },
  {
    href: '/hub/school',
    label: 'Škola',
    icon: GraduationCap,
    activeText: 'text-violet-700',
    activeBg: 'bg-violet-50',
    hoverBg: 'hover:bg-violet-50/60',
    hoverText: 'hover:text-violet-700',
    dot: 'bg-violet-500',
    mobileDot: 'border-b-2 border-violet-500 text-violet-700',
  },
  {
    href: '/hub/sport',
    label: 'Sport',
    icon: Dumbbell,
    activeText: 'text-rose-700',
    activeBg: 'bg-rose-50',
    hoverBg: 'hover:bg-rose-50/60',
    hoverText: 'hover:text-rose-700',
    dot: 'bg-rose-500',
    mobileDot: 'border-b-2 border-rose-500 text-rose-700',
  },
  {
    href: '/dashboard/projekty',
    label: 'Projekty',
    icon: Layers,
    activeText: 'text-indigo-700',
    activeBg: 'bg-indigo-50',
    hoverBg: 'hover:bg-indigo-50/60',
    hoverText: 'hover:text-indigo-700',
    dot: 'bg-indigo-500',
    mobileDot: 'border-b-2 border-indigo-500 text-indigo-700',
  },
  {
    href: '/hub/byznys',
    label: 'Byznys',
    icon: Briefcase,
    activeText: 'text-brand-800',
    activeBg: 'bg-brand-50',
    hoverBg: 'hover:bg-brand-50/60',
    hoverText: 'hover:text-brand-800',
    dot: 'bg-brand-600',
    mobileDot: 'border-b-2 border-brand-600 text-brand-800',
  },
]

interface Props {
  mobile?: boolean
}

export function HubSidebarNav({ mobile = false }: Props) {
  const pathname = usePathname()
  const overviewActive = pathname === '/hub'

  if (mobile) {
    return (
      <div className="flex items-center gap-0 px-2 min-w-max">
        <Link
          href="/hub"
          className={cn(
            'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap',
            overviewActive
              ? 'border-b-2 border-brand-700 text-brand-800'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid size={13} strokeWidth={1.5} />
          Přehled
        </Link>
        {PILLARS.map(p => {
          const active = pathname.startsWith(p.href)
          return (
            <Link
              key={p.href}
              href={p.href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap',
                active ? p.mobileDot : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <p.icon size={13} strokeWidth={1.5} />
              {p.label}
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className="px-3 space-y-0.5">
      {/* Overview */}
      <Link
        href="/hub"
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
          overviewActive
            ? 'bg-brand-50 text-brand-800'
            : 'text-muted-foreground hover:text-brand-800 hover:bg-brand-50'
        )}
      >
        <LayoutGrid size={15} strokeWidth={1.5} />
        Přehled
      </Link>

      {/* Section label */}
      <div className="pt-3 pb-1 px-2.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Moduly</p>
      </div>

      {/* Pillars */}
      {PILLARS.map(p => {
        const active = pathname.startsWith(p.href)
        return (
          <Link
            key={p.href}
            href={p.href}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
              active
                ? `${p.activeBg} ${p.activeText}`
                : `text-muted-foreground ${p.hoverBg} ${p.hoverText}`
            )}
          >
            {active && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', p.dot)} />}
            {!active && <p.icon size={15} strokeWidth={1.5} />}
            {p.label}
          </Link>
        )
      })}

    </div>
  )
}
