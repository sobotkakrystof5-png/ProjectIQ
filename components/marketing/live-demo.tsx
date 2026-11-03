'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { useReducedMotion } from './use-in-view'

const STORY = [
  {
    title: 'Poptávka přijde z webu.',
    text: 'Tereza si vybrala pátek v 9:00. Čárkovaný blok ukazuje její přání, termín zatím není potvrzený.',
  },
  {
    title: 'Detail máte vedle kalendáře.',
    text: 'Vidíte službu, čas a jestli je termín volný. Týden přitom pořád máte před sebou.',
  },
  {
    title: 'Z přání je domluvený termín.',
    text: 'Blok změní podobu a zákaznice dostane potvrzení e-mailem. Její údaje zůstávají u termínu.',
  },
] as const

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

function storyStepAtScroll(markers: (HTMLDivElement | null)[]) {
  let next = 0
  markers.forEach((el, i) => {
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top + rect.height * 0.25 < window.innerHeight * 0.7) next = i
  })
  return next
}

/** Krok sleduje příběh při čtení; ukázku lze ovládat i bez scrollování. */
export function LiveDemo() {
  const [step, setStep] = useState(0)
  const markers = useRef<(HTMLDivElement | null)[]>([])
  const scene = useRef<HTMLDivElement>(null)
  const active = useRef(0)
  const focusFrame = useRef(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const next = storyStepAtScroll(markers.current)
      const focused = document.activeElement
      const keyboardInScene = focused?.matches(':focus-visible') && focused.closest('[data-story-scene]')
      if (next !== active.current && !keyboardInScene) {
        active.current = next
        setStep(next)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const onFocusOut = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-story-scene]')) onScroll()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('focusout', onFocusOut)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('focusout', onFocusOut)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(focusFrame.current)
    }
  }, [])

  const confirmed = step === 2
  const select = (next: number, revealScene = false) => {
    const trigger = document.activeElement
    cancelAnimationFrame(focusFrame.current)
    setStep(next)
    let movedToScene = false
    if (revealScene && scene.current) {
      const rect = scene.current.getBoundingClientRect()
      if (rect.top < 72 || rect.bottom > window.innerHeight - 16) {
        scene.current.scrollIntoView({ block: 'start', behavior: 'instant' })
        active.current = storyStepAtScroll(markers.current)
        movedToScene = true
      }
    }
    focusFrame.current = requestAnimationFrame(() => {
      if (movedToScene || (trigger && !trigger.isConnected)) {
        document.getElementById('story-step-' + next)?.focus({ preventScroll: true })
      }
    })
  }

  return (
    <div className="story-layout flex flex-col gap-8 bg-navy-950 lg:grid lg:items-start lg:grid-cols-[minmax(0,1.8fr)_minmax(220px,0.8fr)] lg:gap-12">
      <div id="ukazka-scena" ref={scene} data-story-scene className="story-scene min-w-0 bg-navy-950 pb-3 lg:sticky lg:top-24">
        <div className="mb-3 flex items-end justify-between gap-4 text-white">
          <div>
            <p className="text-xl font-semibold tracking-[-0.02em]">Kalendář</p>
            <p className="mt-1 hidden text-sm text-navy-200 sm:block">Jedna poptávka, od přání po potvrzení</p>
          </div>
          <span className="shrink-0 text-sm text-navy-200">Ukázka</span>
        </div>

        <div id="ukazka-kalendar" className="overflow-hidden rounded-box bg-surface text-ink">
          <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-navy-100 px-4 sm:px-6">
            <div aria-label="Kroky ukázky" className="flex min-w-0 gap-4 sm:gap-6">
              {['Poptávka', 'Detail', 'Potvrzeno'].map((label, i) => (
                <button
                  key={label}
                  id={'story-step-' + i}
                  type="button"
                  aria-pressed={i === step}
                  aria-controls="ukazka-kalendar"
                  onClick={() => select(i)}
                  className={cn(
                    'min-h-12 border-b-2 px-0.5 text-sm font-semibold transition-colors',
                    i === step ? 'border-navy-700 text-navy-700' : 'border-transparent text-quiet hover:text-ink',
                    focus,
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="hidden font-num text-xs text-quiet sm:block">5.–9. října 2026</span>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0 p-3 sm:p-6">
              <div className="mb-2 flex items-baseline justify-between gap-2 sm:mb-5">
                <span className="text-base font-semibold">Pracovní týden</span>
                <span className="font-num text-xs text-quiet sm:hidden">PÁ 9. 10.</span>
              </div>
              <div className="grid grid-cols-[38px_minmax(0,1fr)] sm:grid-cols-[38px_repeat(5,minmax(0,1fr))]">
                <div aria-hidden />
                {['PO 5', 'ÚT 6', 'ST 7', 'ČT 8', 'PÁ 9'].map((day, i) => (
                  <div key={day} className={cn('pb-3 text-center font-num text-xs text-quiet', i < 4 && 'hidden sm:block')}>
                    {day}
                  </div>
                ))}
                <div className="relative font-num text-[11px] text-quiet" aria-hidden>
                  {[9, 10, 11, 12].map((hour, i) => (
                    <span key={hour} className="absolute left-0" style={{ top: (i * 25) + '%' }}>{hour}:00</span>
                  ))}
                </div>
                {[0, 1, 2, 3, 4].map((day) => (
                  <div key={day} className={cn('relative h-[160px] border-l border-navy-100 lg:h-[280px]', day < 4 && 'hidden sm:block')}>
                    {[0, 1, 2, 3].map((row) => (
                      <span key={row} aria-hidden className="absolute inset-x-0 border-t border-navy-100" style={{ top: (row * 25) + '%' }} />
                    ))}
                    {day === 4 ? (
                      <DemoCalendarEntry confirmed={confirmed} onOpen={() => select(1)} />
                    ) : day === 1 || day === 3 ? (
                      <div className="absolute inset-x-1 top-1/2 min-h-14 overflow-hidden rounded-tiny border-l-[3px] border-navy-700 bg-navy-100 p-2 text-xs text-navy-900">
                        <span className="font-num">11:00</span>
                        <span className="mt-1 block truncate">{day === 1 ? 'Jana' : 'Marek'}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <aside className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-navy-100 bg-navy-50/60 p-4 sm:p-6 lg:flex lg:flex-col lg:items-start lg:border-l lg:border-t-0">
              <div className="min-w-0 lg:w-full">
                <p className={cn('text-xs font-semibold', confirmed ? 'text-navy-700' : 'text-signal-ink')}>
                  {confirmed ? 'Potvrzený termín' : 'Nová poptávka · z webu'}
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] lg:mt-3 lg:text-xl">Tereza Malá</h3>
                <p className="mt-1 text-sm text-quiet">Barvení + střih</p>
                <p className="mt-1 font-num text-xs text-quiet lg:hidden">pá 9. 10. · 9:00–10:30</p>
                <dl className="mt-5 hidden w-full grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm lg:grid">
                  <dt className="text-quiet">Termín</dt><dd className="font-num">pá 9. 10.</dd>
                  <dt className="text-quiet">Čas</dt><dd className="font-num">9:00–10:30</dd>
                </dl>
                {step === 1 && <p className="mt-3 flex items-center gap-2 text-sm text-quiet"><Check size={16} aria-hidden />Termín je volný</p>}
              </div>
              {confirmed ? (
                <a href="#ukazka-zakaznik" className={cn('inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-navy-700 underline-offset-4 hover:underline lg:mt-5', focus)}>
                  K zákaznici <ChevronRight size={16} aria-hidden />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => select(step === 0 ? 1 : 2)}
                  className={cn('inline-flex min-h-11 items-center justify-center rounded-full bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800 lg:mt-5 lg:px-5', focus)}
                >
                  {step === 0 ? 'Otevřít detail' : 'Potvrdit termín'}
                </button>
              )}
            </aside>
          </div>
        </div>
        <p role="status" className="sr-only mt-3 text-sm text-navy-200 sm:not-sr-only">
          {confirmed ? 'Potvrzeno. Tereza dostane e-mail.' : 'Fiktivní data. Zkuste si postup.'}
        </p>
      </div>
      <div className="min-w-0">
        {STORY.map((item, i) => (
          <div
            key={item.title}
            ref={(el) => { markers.current[i] = el }}
            className="flex min-h-[24vh] flex-col items-start justify-center border-t border-navy-800 py-7 lg:min-h-[48vh]"
          >
            <h2 className="max-w-[14ch] text-[28px] font-semibold leading-[1.05] tracking-[-0.025em] text-white sm:text-[32px]">
              {item.title}
            </h2>
            <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-navy-200">{item.text}</p>
            <button
              type="button"
              onClick={() => select(i, true)}
              className={cn('mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-white underline decoration-navy-400 underline-offset-4 hover:decoration-white', focus)}
            >
              Ukázat krok {i + 1}<ChevronRight size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {reduced && <span className="sr-only">Pohyb je vypnutý. Všechny kroky můžete procházet tlačítky.</span>}
    </div>
  )
}

function DemoCalendarEntry({ confirmed, onOpen }: { confirmed: boolean; onOpen: () => void }) {
  const className = cn(
    'story-appointment absolute inset-x-1 top-0 flex h-[37.5%] min-h-11 flex-col items-start gap-1 overflow-hidden rounded-tiny p-2 text-left',
    confirmed ? 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900' : 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
    focus,
  )
  const content = <><span className="flex items-center gap-1 font-num text-xs">9:00 {confirmed && <Check size={13} aria-hidden />}</span><b className="max-w-full truncate text-sm leading-tight sm:text-xs">Tereza Malá</b></>

  return confirmed ? (
    <a href="#ukazka-zakaznik" data-confirmed="true" aria-label="Přejít na zákaznici Terezu Malou, potvrzený termín v pátek 9. října od 9:00 do 10:30" className={className}>{content}</a>
  ) : (
    <button type="button" onClick={onOpen} data-confirmed="false" aria-label="Otevřít poptávku: Tereza Malá, pátek 9. října, 9:00 až 10:30" className={className}>{content}</button>
  )
}
