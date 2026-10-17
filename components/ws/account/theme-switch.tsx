'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useWsTheme } from '@/components/ws/ws-root'
import { THEME_LABELS, THEME_PREFS, type ThemePref } from '@/lib/ws/theme'
import { cn } from '@/lib/ws/utils'

const ICONS: Record<ThemePref, typeof Sun> = { system: Monitor, light: Sun, dark: Moon }

/** Vzhled aplikace v Účtu (S18): platí pro tohle zařízení, uloží se hned. */
export function ThemeSwitch() {
  const { pref, setPref } = useWsTheme()
  return (
    <div role="radiogroup" aria-label="Vzhled aplikace" className="flex flex-wrap gap-2">
      {THEME_PREFS.map((p) => {
        const Icon = ICONS[p]
        const active = pref === p
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPref(p)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-200 ease-zq focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-100 bg-surface text-ink hover:bg-navy-50',
            )}
          >
            <Icon aria-hidden size={18} strokeWidth={1.5} />
            {THEME_LABELS[p]}
          </button>
        )
      })}
    </div>
  )
}
