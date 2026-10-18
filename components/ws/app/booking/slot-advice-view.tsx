'use client'

import Link from 'next/link'
import { AlertTriangle, CircleCheck, Clock } from 'lucide-react'
import type { AdviceDto } from '@/lib/ws/slot-suggest'
import { cn } from '@/lib/ws/utils'

type Pick = { day: string; minutes: number; label: string }

/**
 * Jedna věta o zadaném čase: volno, kolize, mimo otevírací dobu. Barva se
 * nikdy nespoléhá jen na odstín — každý stav má ikonu a text (B8).
 */
export function AdviceTip({ advice, className }: { advice: AdviceDto; className?: string }) {
  if (advice.state === 'none') return null
  const conflict = advice.state === 'conflict'
  return (
    <div className={cn('flex flex-col gap-1.5', className)} role="status">
      {conflict ? (
        <p className="flex items-start gap-2 rounded-chip border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
          <AlertTriangle aria-hidden size={18} strokeWidth={1.5} className="mt-px shrink-0" />
          <span>
            Koliduje s: <span className="font-semibold">{advice.conflict}</span>. Vyberte jiný čas.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-navy-900 dark:bg-navy-800 dark:text-navy-50">
          <CircleCheck aria-hidden size={18} strokeWidth={1.5} className="mt-px shrink-0 text-navy-700 dark:text-navy-300" />
          <span>Termín je volný{advice.staffName ? `, vezme ho ${advice.staffName}` : ''}.</span>
        </p>
      )}
      {advice.outsideHours && (
        <p className="flex items-start gap-2 px-1 text-sm text-quiet">
          <Clock aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <span>Je to mimo otevírací dobu. Zapsat to jde i tak.</span>
        </p>
      )}
    </div>
  )
}

/**
 * Tři nejbližší volné časy jako pilulky. `onPick` doplní čas do formuláře
 * nebo termín rovnou potvrdí; bez otevírací doby se místo nich ukáže odkaz,
 * kde ji nastavit.
 */
export function SuggestionChips({
  advice,
  onPick,
  heading = 'Nejbližší volné časy',
  settingsHref,
  disabled,
  className,
}: {
  advice: AdviceDto
  onPick: (slot: Pick) => void
  heading?: string
  /** Kam vede odkaz „nastavte otevírací dobu“; bez něj se větva s odkazem nevypíše. */
  settingsHref?: string
  disabled?: boolean
  className?: string
}) {
  if (!advice.hoursSet) {
    return settingsHref ? (
      <p className={cn('px-1 text-sm text-quiet', className)}>
        Nastavte{' '}
        <Link href={settingsHref} className="font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
          otevírací dobu
        </Link>
        , ať vám ukážeme volné časy.
      </p>
    ) : null
  }
  if (advice.suggestions.length === 0) {
    return <p className={cn('px-1 text-sm text-quiet', className)}>V nejbližších dnech nevidíme žádný volný čas.</p>
  }
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">{heading}</p>
      <ul className="flex flex-wrap gap-2">
        {advice.suggestions.map((s) => (
          <li key={`${s.day}-${s.minutes}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className="inline-flex min-h-11 items-center rounded-full border border-input bg-surface px-4 font-num text-sm font-semibold text-ink transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
