'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Check, ChevronRight, Loader2 } from 'lucide-react'
import { setProjectStatus, undoProjectStatus } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { nextStep, type JourneyStep } from '@/lib/admin/journey'

/**
 * Osa zakázky od poptávky po hodnocení (AD11) a pod ní **jedno** tlačítko
 * na další krok — jedna hlavní akce na obrazovku (AGENTS.md → B9).
 *
 * Změna stavu je jeden klik a toast nabídne „Zpět". E-mail klientovi odchází
 * se zpožděním a před odesláním se stav v databázi přečte znovu, takže se
 * po „Zpět" nikdy neodešle (viz `setProjectStatus`).
 */
export function ProjectJourney({ projectId, steps }: { projectId: string; steps: JourneyStep[] }) {
  const [pending, start] = useTransition()
  const next = nextStep(steps)
  const hotovo = steps.filter((s) => s.done).length

  const posun = (status: Parameters<typeof setProjectStatus>[1]) =>
    start(async () => {
      try {
        const { previousStatus } = await setProjectStatus(projectId, status)
        toast.success('Stav zakázky je změněný.', {
          description: 'Klientovi odejde e-mail za chvíli — do té doby ho „Zpět" zruší.',
          undo: () =>
            start(async () => {
              try {
                await undoProjectStatus(projectId, previousStatus)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Stav se nepodařilo vrátit.')
              }
            }),
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Stav se nepodařilo změnit.')
      }
    })

  return (
    <section aria-label="Průvodka zakázky" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Kde zakázka je</h2>
        <p className="font-num text-xs text-quiet">
          {hotovo} z {steps.length} kroků
        </p>
      </div>

      <ol className="flex flex-col gap-0 sm:flex-row sm:flex-wrap sm:gap-x-1 sm:gap-y-2">
        {steps.map((step, i) => {
          const jeNaRade = next?.key === step.key
          return (
            <li
              key={step.key}
              className={cn(
                'flex items-center gap-2 py-1.5 sm:py-0',
                jeNaRade && 'font-semibold text-ink',
                !jeNaRade && (step.done ? 'text-ink' : 'text-quiet'),
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
                  step.done && 'border-navy-700 bg-navy-700 text-white',
                  !step.done && jeNaRade && 'border-signal bg-signal text-signal-ink',
                  !step.done && !jeNaRade && 'border-navy-200 bg-surface',
                )}
              >
                {step.done ? <Check size={12} strokeWidth={2.5} /> : null}
              </span>
              <span className="text-sm">
                {step.label}
                <span className="sr-only">{step.done ? ' — hotovo' : jeNaRade ? ' — na řadě' : ' — zbývá'}</span>
              </span>
              {i < steps.length - 1 && (
                <ChevronRight size={13} strokeWidth={1.5} aria-hidden className="ml-1 hidden shrink-0 text-navy-200 sm:block" />
              )}
            </li>
          )
        })}
      </ol>

      {next && (
        <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
          {'status' in (next.action ?? {}) ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => posun((next.action as { status: Parameters<typeof setProjectStatus>[1] }).status)}
            >
              {pending && <Loader2 size={14} strokeWidth={1.75} className="animate-spin" aria-hidden />}
              {(next.action as { label: string }).label}
            </Button>
          ) : next.action && 'href' in next.action ? (
            <Button asChild variant="outline">
              <Link href={next.action.href}>{next.action.label}</Link>
            </Button>
          ) : null}
          {!next.action && next.waiting && <p className="text-sm text-quiet">{next.waiting}</p>}
        </div>
      )}

      {!next && (
        <p className="border-t border-navy-100 pt-4 text-sm text-quiet">
          Hotovo — zakázka prošla celou cestou až k hodnocení.
        </p>
      )}
    </section>
  )
}
