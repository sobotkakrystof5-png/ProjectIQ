'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LiveDot, LoyaltyCard } from '@/components/ws/brand'
import { zqIn } from '@/lib/ws/motion'
import { cn } from '@/lib/ws/utils'
import { DEMO_BOOKED, DEMO_DAYS, DEMO_REQUESTS, DEMO_TIMES } from './content'
import { useLoopActive } from './use-in-view'

const INTERVAL_MS = 2800
/** Stav, který se ukáže bez animací: 4 razítka, poslední poptávka v kalendáři. */
const STATIC_TICK = 4

const TickContext = createContext(0)

/**
 * Společný takt pro štítek „Právě dorazila…" a ukázku v hero, aby ukazovaly stejnou poptávku.
 * Posouvá se, jen když je úvod vidět (brief § 4.1); bez animací stojí na STATIC_TICK.
 */
export function DemoTickProvider({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { active, reduced } = useLoopActive(ref)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [active])

  return (
    <TickContext.Provider value={reduced ? STATIC_TICK : tick}>
      <div ref={ref} className={className}>
        {children}
      </div>
    </TickContext.Provider>
  )
}

/** Štítek „Právě dorazila poptávka: …". */
export function ArrivedBadge({ className }: { className?: string }) {
  const tick = useContext(TickContext)
  const newest = DEMO_REQUESTS[tick % DEMO_REQUESTS.length]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2.5 rounded-full border border-navy-200/20 bg-white/5 py-1.5 pl-3 pr-4 text-[13px] text-navy-100',
        className,
      )}
    >
      <LiveDot />
      <span>
        Právě dorazila poptávka: <b className="font-semibold text-white">{newest.name}</b>
      </span>
    </span>
  )
}

/**
 * Živá ukázka obrazovky Dnes v hero: poptávky přijíždějí, zařadí se do týdne a věrnostní
 * karta dostane razítko. Dekorace pro čtečky skrytá — obsah popisuje `srText`.
 */
export function LiveDemo() {
  const tick = useContext(TickContext)
  const n = DEMO_REQUESTS.length
  const newestIndex = tick % n
  const newest = DEMO_REQUESTS[newestIndex]
  const feed = [0, 1, 2].map((offset) => DEMO_REQUESTS[(newestIndex - offset + n) % n])
  const stamps = tick % 6

  return (
    <div className="relative">
      <p className="sr-only">
        Ukázka aplikace: nová poptávka z webu se sama zařadí do týdenního kalendáře a zákaznici přibude razítko na
        věrnostní kartě.
      </p>

      <div aria-hidden className="relative">
        {/* Okno aplikace */}
        <div className="rounded-[22px] border border-navy-200/20 bg-white/5 p-2.5 md:rounded-b-none md:border-b-0 md:pb-0">
          <div className="flex overflow-hidden rounded-[14px] bg-ground text-ink md:min-h-[380px] md:rounded-b-none">
            {/* Příchozí */}
            <div className="flex w-full flex-col gap-2.5 border-navy-100 bg-surface p-4 sm:p-5 md:w-[290px] md:shrink-0 md:border-r">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold tracking-[-0.02em]">Příchozí</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-bg px-2 py-0.5 font-num text-[11px] text-signal-ink">
                  <LiveDot className="h-1.5 w-1.5" /> živě
                </span>
              </div>
              <ul className="relative flex flex-col gap-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {feed.map((item, i) => (
                    <motion.li
                      key={item.name}
                      layout
                      {...(i === 0 ? zqIn : {})}
                      animate={{ opacity: i === 2 ? 0.55 : 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                      className={cn(
                        'flex flex-col gap-0.5 rounded-chip p-3 transition-colors duration-500',
                        i === 0
                          ? 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink'
                          : 'border border-navy-100 bg-ground',
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <b className="truncate text-[15px] font-semibold">{item.name}</b>
                        <span className="shrink-0 font-num text-[11px] opacity-75">{item.source}</span>
                      </span>
                      <span className="text-[13px] opacity-80">
                        {item.service} · <span className="font-num">{item.when}</span>
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>

            {/* Týden */}
            <div className="hidden min-w-0 flex-1 flex-col gap-3 p-5 md:flex">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold tracking-[-0.02em]">Týden 5.–9. října</span>
                <span className="font-num text-[11px] text-quiet">poptávka se zařadí sama</span>
              </div>
              <div className="grid flex-1 grid-cols-5 gap-2">
                {DEMO_DAYS.map((label, d) => (
                  <div key={label} className="flex flex-col gap-1.5">
                    <span className="font-num text-[11px] text-quiet">{label}</span>
                    {DEMO_TIMES.map((time, r) => {
                      const isNew = newest.day === d && newest.row === r
                      const booked = DEMO_BOOKED[d][r]
                      return (
                        <div key={time} className="relative min-h-[48px]">
                          {booked ? (
                            <div className="h-full rounded-tiny border-l-[3px] border-navy-700 bg-navy-100 px-2 py-1.5 text-[11.5px] leading-tight text-navy-900">
                              <span className="font-num">{time}</span>
                              <br />
                              {booked}
                            </div>
                          ) : (
                            <div className="h-full rounded-tiny border border-dashed border-navy-100" />
                          )}
                          <AnimatePresence>
                            {isNew && (
                              <motion.div
                                key={tick}
                                {...zqIn}
                                className="absolute inset-0 rounded-tiny border-[1.5px] border-dashed border-signal-line bg-signal-bg px-2 py-1.5 text-[11.5px] font-semibold leading-tight text-signal-ink"
                              >
                                <span className="font-num font-medium">{time}</span>
                                <br />
                                <span className="block truncate">{newest.name}</span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <span className="absolute -top-3 left-6 z-10 rounded-full border border-navy-200/20 bg-navy-900 px-2.5 py-1 font-num text-[10px] uppercase tracking-[0.12em] text-navy-200">
          ukázka
        </span>

        {/* Věrnostní karta plave přes pravý horní roh okna */}
        <div className="pointer-events-none relative mx-auto mt-5 w-[280px] md:absolute md:-right-6 md:-top-12 md:mb-0 md:mt-0 md:w-[300px] lg:-right-12">
          <div className="animate-zq-float">
            <LoyaltyCard customer="Tereza Malá" stamps={stamps} total={5} reward="střih zdarma" business="Věrnostní karta" />
          </div>
        </div>
      </div>
    </div>
  )
}
