'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { TileField } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { CHAOS_STATS, type ChaosStat, type ChaosUnit } from './content'
import { SectionHead } from './section-head'
import { useInView, useReducedMotion } from './use-in-view'

/**
 * Blok 1 ze 4, Statistiky (R-080, R-081). Při posouvání na scénu „skáčou“ čísla
 * z průzkumů a blok končí otázkou „Poznáváte se?“. Odpověď (představení ZakazIQ)
 * je až další blok, `introduction.tsx`. Na širokých obrazovkách je scéna přichycená
 * a řídí ji posun stránky; na telefonu a při omezeném pohybu je to obyčejný tok.
 * Každé číslo má pojmenovaný zdroj s odkazem, bez něj se nesmí použít.
 */

type Mode = 'static' | 'scrub'

/** Kdy se které číslo objeví (podíl posunu scénou), pak otázka do konce scény. */
const APPEAR = [0, 0.13, 0.26, 0.39, 0.52] as const
const ASK_AT = 0.7

/** Rozházení po scéně: levý a horní okraj v procentech a natočení. */
const SCATTER = [
  { left: 3, top: 5, rot: -6 },
  { left: 64, top: 3, rot: 5 },
  { left: 34, top: 33, rot: -3 },
  { left: 6, top: 61, rot: 4 },
  { left: 62, top: 57, rot: -5 },
] as const

/** Na telefonu jen lehké natočení, ať je znát, že to k sobě nepatří. */
const STATIC_ROT = [-2, 1.5, -1, 2, -1.5] as const

/** Scéna sedí 88 px pod horním okrajem (pod hlavičkou) a končí 24 px nad spodním. */
const STAGE_TOP = 88
const STAGE_INSET = STAGE_TOP + 24

type Tone = 'light' | 'soft' | 'dark'
const TONES: readonly Tone[] = ['light', 'dark', 'soft', 'light', 'dark']
const TONE: Record<Tone, { card: string; label: string; source: string }> = {
  light: { card: 'bg-surface text-ink', label: 'text-ink', source: 'text-quiet' },
  soft: { card: 'bg-navy-50 text-ink', label: 'text-ink', source: 'text-quiet' },
  dark: { card: 'bg-navy-800 text-white', label: 'text-navy-100', source: 'text-navy-300' },
}

export function formatStat(value: number, unit: ChaosUnit): string {
  const n = Math.round(value)
  switch (unit) {
    case 'minutes': {
      const h = Math.floor(n / 60)
      const m = n % 60
      return m ? `${h} h ${m} min` : `${h} h`
    }
    case 'hours':
      return `${n} h`
    case 'percent':
      return `${n} %`
    case 'days':
      return n === 1 ? '1 den' : n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`
  }
}

/** Číslo doběhne k cílové hodnotě za 900 ms; při omezeném pohybu stojí rovnou na cíli. */
function CountUp({ target, unit, active, reduced }: { target: number; unit: ChaosUnit; active: boolean; reduced: boolean }) {
  const [value, setValue] = useState(reduced ? target : 0)

  useEffect(() => {
    if (!active) return
    if (reduced) {
      setValue(target)
      return
    }
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 900)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, reduced, target])

  return <>{formatStat(active ? value : reduced ? target : 0, unit)}</>
}

function StatCard({
  stat,
  tone,
  active,
  reduced,
  className,
  style,
}: {
  stat: ChaosStat
  tone: Tone
  active: boolean
  reduced: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const t = TONE[tone]
  return (
    <div className={cn('chaos-card rounded-panel p-6 sm:p-7', t.card, className)} style={style}>
      <p
        className={cn(
          'whitespace-nowrap font-num leading-none tracking-[-0.03em]',
          stat.unit === 'minutes' ? 'text-[36px] sm:text-[40px]' : 'text-[44px] sm:text-[52px]',
        )}
      >
        <CountUp target={stat.target} unit={stat.unit} active={active} reduced={reduced} />
      </p>
      <p className={cn('mt-3 text-[16px] leading-snug', t.label)}>{stat.label}</p>
      <p className={cn('mt-4 text-[13px]', t.source)}>
        Zdroj:{' '}
        <a
          href={stat.source.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-[3px] opacity-80 transition-opacity hover:opacity-100"
        >
          {stat.source.name}
        </a>
      </p>
    </div>
  )
}

function AskCopy({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-[36px] font-semibold leading-[1.02] tracking-[-0.03em] text-white sm:text-[56px]">Poznáváte se?</h3>
      <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-navy-200">
        Telefon, diář, tabulka, e-mail a papírek na pultu. Každá z těch věcí funguje. Dohromady ne. A čas, který
        mezi nimi ztratíte, vám nikdo nezaplatí.
      </p>
    </div>
  )
}

/** Podíl posunu scénou od chvíle, kdy se přichytí pod hlavičku, do chvíle, kdy se pustí. */
function useScrubProgress(track: RefObject<HTMLElement | null>, enabled: boolean) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const el = track.current
    if (!el) return
    let frame = 0

    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const stageHeight = window.innerHeight - STAGE_INSET
      const range = rect.height - stageHeight
      const next = range > 0 ? Math.min(1, Math.max(0, (STAGE_TOP - rect.top) / range)) : 1
      setProgress((prev) => (Math.abs(prev - next) < 0.003 ? prev : next))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // Obsah nad scénou mění výšku (živá ukázka v hero), tím se posune i dráha scény.
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    resize?.observe(document.documentElement)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resize?.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [track, enabled])

  return progress
}

function ScrubStage({ reduced }: { reduced: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const progress = useScrubProgress(track, true)
  const asking = progress >= ASK_AT

  return (
    <div ref={track} className="relative h-[300vh]">
      <div
        className="sticky overflow-hidden rounded-slab bg-navy-950"
        style={{ top: STAGE_TOP, height: `calc(100vh - ${STAGE_INSET}px)` }}
      >
        <TileField cols={28} rows={16} className="-left-2 -top-2" />

        {/* Čísla pro čtečky v pořadí, v jakém skáčou na scénu. */}
        <ul className="sr-only">
          {CHAOS_STATS.map((stat) => (
            <li key={stat.id}>
              {formatStat(stat.target, stat.unit)} {stat.label} (zdroj: {stat.source.name})
            </li>
          ))}
        </ul>

        <div aria-hidden className="absolute inset-0">
          {CHAOS_STATS.map((stat, i) => {
            if (progress < APPEAR[i]) return null
            const s = SCATTER[i]
            return (
              <StatCard
                key={stat.id}
                stat={stat}
                tone={TONES[i]}
                active
                reduced={reduced}
                className="chaos-slam absolute z-20 w-[264px] xl:w-[300px]"
                style={
                  {
                    left: `${s.left}%`,
                    top: `${s.top}%`,
                    opacity: asking ? 0.3 : 1,
                    '--zq-rot': `${s.rot}deg`,
                    transform: 'rotate(var(--zq-rot))',
                  } as React.CSSProperties
                }
              />
            )
          })}
        </div>

        <p
          className={cn(
            'absolute inset-x-0 bottom-6 text-center text-sm text-navy-300 transition-opacity duration-500',
            progress < 0.06 ? 'opacity-100' : 'opacity-0',
          )}
        >
          Posouvejte dál
        </p>

        {/* Vnější div drží střed, animuje se až vnitřní: zq-rise končí na `transform: none`. */}
        {asking && (
          <div className="absolute left-1/2 top-1/2 z-30 w-[min(720px,92%)] -translate-x-1/2 -translate-y-1/2">
            <div className="animate-zq-rise rounded-slab bg-navy-950/85 px-10 py-10 text-center backdrop-blur-sm">
              <AskCopy className="[&_p]:mx-auto" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StaticCard({ stat, i, reduced }: { stat: ChaosStat; i: number; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, threshold: 0.35 })
  const shown = inView || reduced
  return (
    <div ref={ref} className={cn(!shown && 'opacity-0')} style={{ '--zq-rot': `${STATIC_ROT[i]}deg` } as React.CSSProperties}>
      <StatCard
        stat={stat}
        tone={TONES[i]}
        active={shown}
        reduced={reduced}
        className={cn(shown && !reduced && 'chaos-slam')}
        style={{ transform: `rotate(${STATIC_ROT[i]}deg)` }}
      />
    </div>
  )
}

function StaticStage({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-slab bg-navy-950 px-5 py-10 sm:px-8 sm:py-14">
      <TileField cols={20} rows={40} className="-left-2 -top-2" />
      <div className="relative">
        <div className="grid gap-5 sm:grid-cols-2">
          {CHAOS_STATS.map((stat, i) => (
            <StaticCard key={stat.id} stat={stat} i={i} reduced={reduced} />
          ))}
        </div>
        <AskCopy className="mt-16 sm:mt-20" />
      </div>
    </div>
  )
}

export function Chaos() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>('static')

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setMode(query.matches && !reduced ? 'scrub' : 'static')
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [reduced])

  return (
    <section id="chaos" aria-labelledby="chaos-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <SectionHead id="chaos-title" title="Kolik vás stojí chaos." />
      <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-quiet">
        Firma na pěti místech: telefon, diář, tabulka, e-mail a papírek na pultu. Takhle to vypadá v číslech z
        průzkumů. Zdroj je pod každým z nich.
      </p>
      <div className="mt-10 md:mt-12">{mode === 'scrub' ? <ScrubStage reduced={reduced} /> : <StaticStage reduced={reduced} />}</div>
    </section>
  )
}
