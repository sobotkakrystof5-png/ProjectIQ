'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { SectionHead } from './section-head'
import { useReducedMotion } from './use-in-view'

const STEPS = [
  {
    title: 'Zákazník se objedná',
    text: 'Na webu, přes odkaz nebo QR kód na pultu.',
  },
  {
    title: 'Poptávka se ukáže v kalendáři',
    text: 'Jako čárkovaný blok. Hned vidíte, kam padne.',
  },
  {
    title: 'Potvrdíte termín',
    text: 'V aplikaci nebo přímo z e-mailu. Zákazník dostane potvrzení.',
  },
  {
    title: 'Po návštěvě zapíšete platbu',
    text: 'Příjem se ukáže v přehledu a podle nastavení přibude razítko.',
  },
] as const

/** Pole objednávky v pořadí, v jakém je zákazník vyplní. Stejná data jdou do kalendáře i do e-mailu. */
const ORDER_FIELDS = [
  { label: 'Služba', options: ['Střih', 'Barvení + střih', 'Konzultace'], value: 'Barvení + střih' },
  { label: 'Termín', options: ['Pá 9. 10.', 'So 10. 10.', 'Po 12. 10.'], value: 'Pá 9. 10.' },
  { label: 'Čas', options: ['9:00', '10:30', '13:00'], value: '9:00' },
  { label: 'Jméno', options: [], value: 'Tereza Malá' },
] as const

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
const motion = 'motion-reduce:animate-none motion-reduce:transition-none'

/** Kde je kotva (čára na 60 % výšky okna) mezi kroky: celé číslo = krok, desetinná část = postup uvnitř kroku. */
function progressAt(tops: number[], anchor: number) {
  let pos = 0
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] > anchor) break
    pos = i
    const next = tops[i + 1]
    if (next === undefined) break
    if (next > anchor) return i + (anchor - tops[i]) / (next - tops[i])
  }
  return pos
}

/** Pole objednávky: `stage` od 0 do počtu polí. Hotové pole se ukáže navy, aktivní má signální rámeček. */
function fieldState(index: number, stage: number): 'empty' | 'active' | 'done' {
  if (stage >= index + 1) return 'done'
  if (stage >= index) return 'active'
  return 'empty'
}

/** Pilulka ve stylu rozhraní: služba, datum, čas. */
function Pill({
  active = false,
  ring = false,
  children,
}: {
  active?: boolean
  ring?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3 text-[15px] transition-colors duration-300 motion-reduce:transition-none',
        active ? 'border-navy-700 bg-navy-700 text-white' : 'border-navy-200 text-navy-700',
        ring && 'ring-2 ring-signal-line ring-offset-2 ring-offset-surface',
      )}
    >
      {children}
    </span>
  )
}

/** Týden Po–Pá, 9–12 h. Každý sloupec dostane svoje bloky (absolutní pozice podle času). */
function WeekGrid({ columns }: { columns: ReactNode[] }) {
  const days = ['Po 5.', 'Út 6.', 'St 7.', 'Čt 8.', 'Pá 9.']
  return (
    <div className="grid grid-cols-5 text-[13px]">
      {days.map((day) => (
        <div key={day} className="pb-2 text-center font-num text-quiet">
          {day}
        </div>
      ))}
      {columns.map((content, col) => (
        <div key={col} className="relative h-[250px] border-l border-navy-100">
          {[0, 1, 2].map((row) => (
            <span
              key={row}
              aria-hidden
              className="absolute inset-x-0 border-t border-navy-100"
              style={{ top: `${(row * 100) / 3}%` }}
            />
          ))}
          {content}
        </div>
      ))}
    </div>
  )
}

/** Blok termínu. Čárkovaný = poptávka, plný = potvrzeno. */
function Block({
  top,
  height,
  name,
  time,
  state,
  pending = false,
  className,
}: {
  top: number
  height: number
  name: string
  time: string
  state: string
  pending?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'absolute inset-x-1 flex flex-col gap-0.5 overflow-hidden rounded-tiny p-2 text-[13px] leading-tight',
        pending
          ? 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink'
          : 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900',
        motion,
        className,
      )}
      style={{ top: `${top}%`, height: `${height}%` }}
    >
      <span className="font-num">{time}</span>
      <b className="font-semibold">{name}</b>
      <span className="mt-auto">{state}</span>
    </div>
  )
}

function OrderScene({ fill }: { fill: number }) {
  const stage = fill * ORDER_FIELDS.length
  const sent = fill >= 1
  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
      <div className="min-w-0">
        <p className="text-sm text-quiet">Objednávka na webu salonu</p>
        <div className="mt-5 grid gap-5">
          {ORDER_FIELDS.map((field, i) => {
            const state = fieldState(i, stage)
            return (
              <div key={field.label}>
                <p className="text-sm font-medium text-quiet">{field.label}</p>
                {field.options.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {field.options.map((option) => (
                      <Pill
                        key={option}
                        active={state !== 'empty' && option === field.value}
                        ring={state === 'active' && option === field.value}
                      >
                        {option}
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <span
                    className={cn(
                      'mt-2 flex min-h-11 items-center rounded-chip border px-3 py-2.5 text-[15px] transition-colors duration-300 motion-reduce:transition-none',
                      state === 'empty' ? 'border-navy-200 text-quiet' : 'border-navy-200 text-ink',
                      state === 'active' && 'ring-2 ring-signal-line ring-offset-2 ring-offset-surface',
                    )}
                  >
                    {state === 'empty' ? 'Jméno a příjmení' : field.value}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <span
          className={cn(
            'mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold transition-colors duration-500 motion-reduce:transition-none',
            sent ? 'bg-navy-700 text-white' : 'border border-navy-200 text-quiet',
          )}
        >
          Odeslat poptávku
        </span>
      </div>
      <p className="rounded-chip border border-navy-100 bg-ground p-4 text-[15px] leading-snug text-quiet">
        Stejná stránka se otevře i z QR kódu na pultu. Zákazník si čas vybere sám.
      </p>
    </div>
  )
}

function CalendarScene() {
  return (
    <div>
      <p className="mb-4 text-sm text-quiet">Pracovní týden · čárkovaně zatím jen přání</p>
      <WeekGrid
        columns={[
          <Block key="po" top={66.67} height={33.33} name="Jana" time="11:00" state="Potvrzeno" />,
          null,
          <Block key="st" top={66.67} height={33.33} name="Marek" time="11:00" state="Potvrzeno" />,
          null,
          <Block
            key="pa"
            top={0}
            height={50}
            name="Tereza Malá"
            time="9:00–10:30"
            state="Nová poptávka"
            pending
            className="animate-zq-in"
          />,
        ]}
      />
    </div>
  )
}

function ConfirmScene() {
  return (
    <div className="grid gap-5">
      <div>
        <p className="mb-4 text-sm text-quiet">Pracovní týden</p>
        <WeekGrid
          columns={[
            <Block key="po" top={66.67} height={33.33} name="Jana" time="11:00" state="Potvrzeno" />,
            null,
            <Block key="st" top={66.67} height={33.33} name="Marek" time="11:00" state="Potvrzeno" />,
            null,
            <Block key="pa" top={0} height={50} name="Tereza Malá" time="9:00–10:30" state="Potvrzeno" />,
          ]}
        />
      </div>
      <div className={cn('rounded-chip border border-navy-200 bg-ground p-4 sm:p-5 animate-zq-in', motion)}>
        <p className="flex items-center gap-2 text-sm font-medium text-quiet">
          <Check size={16} aria-hidden />
          E-mail zákaznici · odesláno
        </p>
        <p className="mt-3 font-semibold text-ink">Máme domluveno: pá 9. 10. v 9:00</p>
        <p className="mt-2 text-[15px] leading-relaxed text-quiet">
          Dobrý den, Terezo, těšíme se. Pokud byste čas potřebovala změnit, udělejte to odkazem v tomhle e-mailu.
        </p>
      </div>
    </div>
  )
}

function PaymentScene() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={cn('flex flex-col rounded-chip border border-navy-200 p-5 animate-zq-in', motion)}>
        <span className="self-start rounded-full bg-navy-100 px-3 py-1 text-sm font-medium text-navy-800">
          Zaplaceno
        </span>
        <p className="mt-6 font-num text-4xl font-semibold tracking-[-0.02em] text-ink">1 850 Kč</p>
        <p className="mt-2 text-[15px] text-quiet">Barvení + střih · Tereza Malá</p>
        <p className="mt-auto flex items-center gap-2 pt-6 text-[15px] text-navy-800">
          <Check size={16} aria-hidden />
          Zapsáno do přehledu
        </p>
      </div>
      <div className={cn('rounded-chip border border-navy-200 bg-ground p-5 animate-zq-in', motion)}>
        <p className="text-sm font-medium text-quiet">Věrnostní karta</p>
        <div className="mt-5 grid grid-cols-5 gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex aspect-square items-center justify-center rounded-full bg-navy-700 text-white">
              <Check size={16} />
            </span>
          ))}
          <span className="flex aspect-square items-center justify-center rounded-full border-[1.5px] border-dashed border-signal-line bg-signal-bg font-num text-signal-ink">
            +1
          </span>
        </div>
        <p className="mt-5 text-[15px] leading-snug text-quiet">
          Razítko přibude samo po zaplacené návštěvě. Odměnu za pátou návštěvu si nastavíte sami.
        </p>
      </div>
    </div>
  )
}

function renderScene(step: number, fill: number) {
  switch (step) {
    case 0:
      return <OrderScene fill={fill} />
    case 1:
      return <CalendarScene />
    case 2:
      return <ConfirmScene />
    default:
      return <PaymentScene />
  }
}

/** 03 Jak to funguje: scroll vede kroky a vyplňování objednávky. Jedna poptávka se pak jen přesouvá dál, data se nepřepisují. Tlačítka vedou na krok, nic se nepřehrává samo. */
export function HowItWorks() {
  const [pos, setPos] = useState(0)
  const markers = useRef<(HTMLDivElement | null)[]>([])
  const reduced = useReducedMotion()

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const anchor = window.innerHeight * 0.6
      const tops = markers.current.map((el) => (el ? el.getBoundingClientRect().top : Infinity))
      // Zaokrouhlení: state se mění jen při znatelném posunu, ne v každém snímku.
      setPos(Math.round(progressAt(tops, anchor) * 100) / 100)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const step = Math.min(STEPS.length - 1, Math.floor(pos))
  const fill = reduced ? 1 : Math.min(pos, 1)

  const jump = (i: number) => {
    const el = markers.current[i]
    if (!el) return
    // Krok se zarovná tak, aby kotva scrollu přesně ukazovala na něj.
    window.scrollTo({
      top: window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.6,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  return (
    <section
      id="jak-to-funguje"
      aria-labelledby="jak-title"
      className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]"
    >
      <SectionHead
        id="jak-title"
        number="03"
        label="Jak to funguje"
        title="Jedna poptávka."
        accent="Nula přepisování."
      />
      <div className="story-layout relative mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-8">
        <div className="order-2 lg:order-1">
          {STEPS.map((item, i) => (
            <div
              key={item.title}
              ref={(el) => {
                markers.current[i] = el
              }}
              className="flex min-h-[40vh] flex-col justify-center py-6 lg:min-h-[56vh] lg:py-8"
            >
              <p className="mb-3 flex items-center gap-3 font-num text-sm font-medium uppercase tracking-[0.12em] text-navy-400">
                <span className={i === step ? 'text-signal' : undefined}>0{i + 1}</span>
                <span>/ 04</span>
                <span aria-hidden className="h-0 flex-1 border-t-[1.5px] border-dashed border-signal-line" />
              </p>
              <h3 className="text-2xl font-semibold leading-tight tracking-[-0.02em]">{item.title}</h3>
              <p className="mt-3 text-[17px] leading-relaxed text-quiet">{item.text}</p>
              <button
                type="button"
                onClick={() => jump(i)}
                aria-controls="jak-scena"
                className={cn(
                  'mt-3 inline-flex min-h-11 items-center self-start rounded-full text-base text-navy-700 underline underline-offset-4',
                  focus,
                )}
              >
                Ukázat krok {i + 1}
              </button>
            </div>
          ))}
        </div>

        <div className="story-scene sticky top-24 order-1 min-w-0 overflow-hidden rounded-panel border border-navy-200 bg-surface text-ink lg:order-2">
          <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3 sm:px-6">
            <span aria-live="polite" className="font-semibold">
              {STEPS[step].title}
            </span>
            <span className="font-num text-[13px] uppercase tracking-[0.08em] text-quiet">Ukázka</span>
          </div>
          <div id="jak-scena" className="min-h-[400px] p-4 sm:p-6">
            <div key={step} className={cn('animate-zq-rise', motion)}>
              {renderScene(step, fill)}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-navy-100 bg-ground px-4 py-3 sm:px-6">
            <span className="font-num text-sm text-quiet">
              Krok {step + 1} z {STEPS.length} · fiktivní data
            </span>
          </div>
        </div>
      </div>
      {reduced && <span className="sr-only">Pohyb je vypnutý. Kroky můžete procházet tlačítky.</span>}
    </section>
  )
}
