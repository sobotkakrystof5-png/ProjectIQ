'use client'

import { useId, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { TileGlyph } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { SEGMENTS, type SegmentExample } from './content'
import { SectionHead } from './section-head'

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

/** Pilulka jako na objednávací stránce (components/ws/order/order-flow.tsx). */
function Pill({ active = false, outline = false, children }: { active?: boolean; outline?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-10 items-center justify-center rounded-full px-3.5 text-[14px] font-semibold',
        active ? 'bg-navy-700 text-white' : outline ? 'border border-navy-200 text-ink' : 'bg-navy-50 text-navy-900',
      )}
    >
      {children}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-ink">{children}</p>
}

/**
 * Výřez objednávací stránky pro daný obor: stejné prvky, jaké zákazník uvidí
 * na /r/[slug] (služby, pracovník, vlastní kolonka, lekce, návrh času).
 * Jen ilustrace, text vedle říká totéž — proto aria-hidden.
 */
function OrderPreview({ example }: { example: SegmentExample }) {
  const { services, sessions, staff, field, advice, mode } = example
  return (
    <div aria-hidden className="overflow-hidden rounded-panel border border-navy-100 bg-surface text-ink">
      <div className="flex items-center gap-3 border-b border-navy-100 px-5 py-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-tiny bg-navy-700 text-[13px] font-semibold text-white">
          {initials(example.business)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{example.business}</p>
          <p className="text-[13px] text-quiet">Objednávka online</p>
        </div>
        <span className="ml-auto shrink-0 text-[13px] text-quiet">Ukázka</span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-2.5">
          <p className="text-[18px] font-semibold tracking-[-0.02em]">Co pro vás můžeme udělat?</p>
          <ul className="flex flex-col gap-2">
            {services.map((s, i) => (
              <li
                key={s.name}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-chip border px-4 py-3',
                  i === 0 ? 'border-navy-700 bg-navy-50' : 'border-navy-100',
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      i === 0 ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-200',
                    )}
                  >
                    {i === 0 && <Check size={12} strokeWidth={2.5} />}
                  </span>
                  <span className="truncate text-[15px] font-semibold">{s.name}</span>
                </span>
                <span className="shrink-0 font-num text-[13px] text-quiet">{s.duration}</span>
              </li>
            ))}
          </ul>
        </div>

        {sessions && (
          <div className="flex flex-col gap-2">
            <Label>Vypsané lekce</Label>
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 rounded-chip border border-navy-100 px-4 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold">{s.name}</span>
                    <span className="font-num text-[13px] text-quiet">{s.when}</span>
                  </span>
                  <span className="shrink-0 font-num text-[13px] text-navy-700">{s.places}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {staff && (
          <div className="flex flex-col gap-2">
            <Label>Kdo vás obslouží?</Label>
            <div className="flex flex-wrap gap-2">
              {staff.map((name, i) => (
                <Pill key={name} active={i === 0}>
                  {name}
                </Pill>
              ))}
            </div>
          </div>
        )}

        {field && (
          <div className="flex flex-col gap-2">
            <Label>{field.label}</Label>
            <div className="flex h-11 items-center rounded-chip border border-navy-100 px-3.5 text-[15px]">{field.value}</div>
          </div>
        )}

        {mode === 'free' && (
          <div className="flex flex-col gap-2">
            <Label>Kdy se vám to hodí?</Label>
            <div className="grid grid-cols-2 gap-2">
              <span className="flex h-11 items-center rounded-chip border border-navy-100 px-3.5 font-num text-[15px]">pá 9. 10.</span>
              <span className="flex h-11 items-center rounded-chip border border-navy-100 px-3.5 font-num text-[15px]">10:00</span>
            </div>
            <p className="text-[13px] text-quiet">Navrhněte čas, firma vám ho potvrdí.</p>
          </div>
        )}

        {mode === 'slots' && (
          <div className="flex flex-col gap-2">
            <Label>Kdy se vám to hodí?</Label>
            <div className="flex flex-wrap gap-2">
              {['pá 9. 10.', 'po 12. 10.', 'út 13. 10.'].map((d, i) => (
                <Pill key={d} active={i === 0}>
                  <span className="font-num">{d}</span>
                </Pill>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['9:00', '10:30', '13:00', '16:00'].map((t, i) => (
                <Pill key={t} active={i === 1}>
                  <span className="font-num">{t}</span>
                </Pill>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {advice && <Pill outline>Nevím, poradíte mi</Pill>}
          <Pill active>Pokračovat</Pill>
        </div>
      </div>
    </div>
  )
}

/**
 * Pro koho: šest oborů, jedna objednávací stránka. Přepínač ukáže, jak objednávka
 * vypadá u kadeřnictví, restaurace, účetní, lekcí, řemesla a ordinace. Všechno jsou
 * existující funkce (služby, kolonky, pracovníci, lekce, návrh času), jen jinak nastavené.
 */
export function Segments() {
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()
  const segment = SEGMENTS[active]

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (active + delta + SEGMENTS.length) % SEGMENTS.length
    setActive(next)
    tabs.current[next]?.focus()
  }

  return (
    <section id="pro-koho" aria-labelledby="pro-koho-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <SectionHead id="pro-koho-title" title="Pro každý obor, kde se objednává." />
      <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-quiet">
        Služby, délky, kolonky v objednávce i pracovníky si nastavíte podle sebe. Takhle vypadá objednávka v šesti
        různých oborech.
      </p>

      <div
        role="tablist"
        aria-label="Obor"
        onKeyDown={onKeyDown}
        className="-mx-5 mt-8 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7 md:mt-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SEGMENTS.map((s, i) => {
          const selected = i === active
          return (
            <button
              key={s.key}
              ref={(el) => {
                tabs.current[i] = el
              }}
              id={`${base}-tab-${s.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 text-[15px] font-semibold transition-colors duration-200 ease-zq',
                selected ? 'bg-navy-700 text-white' : 'bg-surface text-ink ring-1 ring-inset ring-navy-100 hover:bg-navy-50',
                focus,
              )}
            >
              <TileGlyph className={selected ? '[&_span]:bg-white' : undefined} />
              {s.label}
            </button>
          )
        })}
      </div>

      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${segment.key}`}
        className="mt-6 grid items-start gap-8 lg:mt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14"
      >
        <div key={segment.key} className="flex flex-col gap-6 animate-zq-pop-in lg:pt-4">
          <h3 className="max-w-[18ch] text-[28px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[36px]">
            {segment.title}
          </h3>
          <ul className="flex flex-col gap-4">
            {segment.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[17px] leading-relaxed text-ink">
                <TileGlyph className="mt-[9px] shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="text-[15px] text-quiet">Stejná aplikace, stejná cena. Liší se jen nastavení.</p>
        </div>
        <div key={`${segment.key}-preview`} className="min-w-0 animate-zq-pop-in">
          <OrderPreview example={segment.example} />
        </div>
      </div>
    </section>
  )
}
