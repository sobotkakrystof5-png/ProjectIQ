'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { STEPS } from './content'
import { SectionHead } from './section-head'
import { useLoopActive } from './use-in-view'

const STEP_MS = 2800

/** Čtyři velké dílky v rohu panelu — zvětšené logo. */
function CornerTiles() {
  return (
    <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 grid grid-cols-2 gap-3 opacity-60 md:-right-6 md:-top-6">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'block h-20 w-20 rounded-[22px] md:h-28 md:w-28 md:rounded-[30px]',
            i === 1 || i === 2 ? 'bg-navy-800' : 'border border-navy-200/10',
          )}
        />
      ))}
    </div>
  )
}

/**
 * 03 Jak to funguje — čtyři kroky se samy střídají (2,8 s), jen když je panel vidět.
 * Kliknutí na krok cyklus zastaví a ukáže ten krok; „Přehrát znovu" ho pustí od začátku.
 */
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const { active: loopActive, reduced } = useLoopActive(ref)
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!loopActive || paused) return
    const id = window.setTimeout(() => setCurrent((c) => (c + 1) % STEPS.length), STEP_MS)
    return () => window.clearTimeout(id)
  }, [loopActive, paused, current, round])

  const replay = () => {
    setPaused(false)
    setCurrent(0)
    setRound((r) => r + 1)
  }

  return (
    <section id="jak-to-funguje" aria-labelledby="jak-title" className="mx-auto max-w-[1200px] px-3 pt-[72px] sm:px-7 md:pt-[120px]">
      <div ref={ref} className="relative overflow-hidden rounded-slab bg-navy-950 px-5 py-12 text-white sm:px-10 md:py-16">
        <CornerTiles />
        <div className="relative">
          <SectionHead id="jak-title" number="03" label="Jak to funguje" title="Jedna poptávka." accent="Nula přepisování." onDark />

          <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => {
              const on = !reduced && i === current
              const done = !reduced && i < current
              return (
                <li key={step.n}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrent(i)
                      setPaused(true)
                    }}
                    aria-current={on ? 'step' : undefined}
                    className={cn(
                      'flex h-full w-full flex-col gap-3 rounded-box p-5 text-left transition-colors duration-300 ease-zq focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300',
                      on ? 'bg-white text-navy-950' : 'border border-navy-200/15 bg-white/5 text-white hover:bg-white/10',
                    )}
                  >
                    <span aria-hidden className={cn('block h-1 w-full overflow-hidden rounded-full', on ? 'bg-navy-100' : 'bg-white/10')}>
                      {on && !paused ? (
                        <motion.span
                          key={`${current}-${round}`}
                          className="block h-full bg-navy-700"
                          initial={{ width: '0%' }}
                          animate={{ width: loopActive ? '100%' : '0%' }}
                          transition={{ duration: STEP_MS / 1000, ease: 'linear' }}
                        />
                      ) : (
                        <span className={cn('block h-full', on ? 'w-full bg-navy-700' : done ? 'w-full bg-navy-300' : 'w-0')} />
                      )}
                    </span>
                    <span className={cn('font-num text-sm', on ? 'text-navy-500' : 'text-navy-300')}>{step.n}</span>
                    <span className="text-lg font-semibold leading-snug tracking-[-0.01em]">{step.title}</span>
                    <span className={cn('text-[15px] leading-relaxed', on ? 'text-quiet' : 'text-navy-200')}>{step.text}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          {!reduced && (
            <button
              type="button"
              onClick={replay}
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 text-sm text-navy-200 transition-colors hover:text-white"
            >
              <RotateCcw size={16} strokeWidth={1.5} aria-hidden />
              Přehrát znovu
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
