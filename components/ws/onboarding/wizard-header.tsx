'use client'

import { SignOutButton } from '@clerk/nextjs'
import { Logo } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'

const STEPS = [
  { n: '01', label: 'Název a obor' },
  { n: '02', label: 'Předplatné' },
]

/** Tmavá hlavička průvodce Nový byznys s ukazatelem kroků (mockup C5). */
export function WizardHeader({ step }: { step: 1 | 2 }) {
  return (
    <header className="bg-navy-950 text-white">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <Logo size={32} onDark />
          <span className="text-[15px] font-semibold">Nový byznys</span>
        </div>
        <ol className="order-3 flex w-full flex-wrap gap-1.5 sm:order-none sm:w-auto" aria-label="Kroky">
          {STEPS.map((s, i) => {
            const current = i + 1 === step
            const done = i + 1 < step
            return (
              <li
                key={s.n}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px]',
                  current && 'bg-white font-semibold text-navy-950',
                  done && 'bg-navy-800 text-navy-200',
                  !current && !done && 'border border-navy-800 text-navy-300',
                )}
              >
                <span className="font-num text-[11px]">{s.n}</span>
                {s.label}
              </li>
            )
          })}
        </ol>
        <SignOutButton redirectUrl="/">
          <button
            type="button"
            className="min-h-[44px] rounded-full px-3 text-[13px] text-navy-300 transition-colors duration-200 ease-zq hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300"
          >
            Odhlásit se
          </button>
        </SignOutButton>
      </div>
    </header>
  )
}
