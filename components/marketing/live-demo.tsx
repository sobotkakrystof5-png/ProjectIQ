'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/ws/utils'
import { useReducedMotion } from './use-in-view'

const STORY = [
  {
    title: 'Poptávka přijde z webu.',
    text: 'Tereza si vybrala pátek v 9:00. Čárkovaný blok ukazuje její přání, termín zatím není potvrzený.',
    action: 'Otevřít detail',
  },
  {
    title: 'Vše potřebné po ruce.',
    text: 'Služba, čas i zákaznice na jednom místě. Detail otevřete vedle kalendáře.',
    action: 'Potvrdit termín',
  },
  {
    title: 'Z přání je domluvený termín.',
    text: 'Blok změní podobu a zákaznice dostane potvrzení e-mailem. Její údaje zůstávají u termínu.',
    action: 'Prohlédnout zákaznici',
  },
] as const

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/** Scroll přepíná krok podle kapitoly ve výhledu, oběma směry. Kliknutí platí do přechodu na jinou kapitolu. */
export function LiveDemo() {
  const [step, setStep] = useState(0)
  const markers = useRef<(HTMLDivElement | null)[]>([])
  const active = useRef(0)
  const focusFrame = useRef(0)
  const reduced = useReducedMotion()
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let next = 0
      markers.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.7)
          next = i
      })
      if (next !== active.current) {
        active.current = next
        // Čtení nebo ovládání ukázky klávesnicí nesmí scroll přerušit.
        if (!document.activeElement?.closest('[data-story-scene]'))
          setStep(next)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(focusFrame.current)
    }
  }, [])
  const confirmed = step === 2
  const select = (next: number) => {
    const trigger = document.activeElement
    cancelAnimationFrame(focusFrame.current)
    setStep(next)
    focusFrame.current = requestAnimationFrame(() => {
      // Po zavření detailu zůstane klávesnice u stejné ukázky.
      if (trigger && !trigger.isConnected) {
        document.getElementById(`story-step-${next}`)?.focus({ preventScroll: true })
      }
    })
  }
  return (
    <div className="story-layout relative grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <div className="order-2 lg:order-1">
        {STORY.map((item, i) => (
          <div
            key={item.title}
            ref={(el) => {
              markers.current[i] = el
            }}
            className="flex min-h-[30vh] flex-col justify-center py-8 lg:min-h-[38vh]"
          >
            <p className="mb-3 flex items-center gap-3 font-num text-sm font-medium uppercase tracking-[0.12em] text-navy-400">
              <span className="text-signal">0{i + 1}</span>
              <span>/ 03</span>
              <span aria-hidden className="h-0 flex-1 border-t-[1.5px] border-dashed border-signal-line" />
            </p>
            <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-white">
              {item.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-navy-200">
              {item.text}
            </p>
            <button
              type="button"
              onClick={() => select(i)}
              className={cn(
                'mt-3 inline-flex min-h-11 items-center self-start rounded-full text-base text-navy-100 underline underline-offset-4',
                focus,
              )}
            >
              Ukázat krok {i + 1}
            </button>
          </div>
        ))}
      </div>
      <div
        data-story-scene
        className="story-scene sticky top-24 order-1 min-w-0 overflow-hidden rounded-panel border border-navy-200 bg-surface text-ink lg:order-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-4 py-3 sm:px-6">
          <span className="font-semibold">
            Kalendář{' '}
            <span className="ml-2 font-num text-[13px] font-normal text-quiet">
              UKÁZKA
            </span>
          </span>
          <span className="font-num text-sm text-quiet">5.–9. října 2026</span>
        </div>
        <div
          aria-label="Kroky ukázky"
          className="grid grid-cols-3 border-b border-navy-100 bg-ground p-2"
        >
          {['Poptávka', 'Detail', 'Potvrzeno'].map((label, i) => (
            <button
              key={label}
              id={`story-step-${i}`}
              type="button"
              aria-pressed={i === step}
              aria-controls="ukazka-kalendar"
              onClick={() => select(i)}
              className={cn(
                'min-h-11 rounded-full px-2 text-base font-medium transition-colors',
                i === step
                  ? 'bg-navy-700 text-white'
                  : 'text-quiet hover:bg-navy-100',
                focus,
              )}
            >
              <span className="mr-1 font-num text-[13px]">0{i + 1}</span>
              {label}
            </button>
          ))}
        </div>
        <div
          id="ukazka-kalendar"
          className="relative grid min-h-[340px] grid-cols-1 sm:min-h-[430px]"
        >
          <div
            className={cn(
              'p-4 sm:p-6',
              step === 1 && 'hidden xl:block xl:pr-[300px]',
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-medium">Pracovní týden</span>
              <span className="font-num text-[13px] text-quiet sm:hidden">
                PÁ 9.
              </span>
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)] sm:grid-cols-[32px_repeat(5,minmax(0,1fr))]">
              <div aria-hidden />
              {['PO 5', 'ÚT 6', 'ST 7', 'ČT 8', 'PÁ 9'].map((day, i) => (
                <div
                  key={day}
                  className={cn(
                    'pb-3 text-center font-num text-[13px] text-quiet',
                    i < 4 && 'hidden sm:block',
                  )}
                >
                  {day}
                </div>
              ))}
              <div
                className="relative font-num text-[12px] text-quiet"
                aria-hidden
              >
                {[9, 10, 11, 12].map((hour, i) => (
                  <span
                    key={hour}
                    className="absolute left-0"
                    style={{ top: `${i * 25}%` }}
                  >
                    {hour}:00
                  </span>
                ))}
              </div>
              {[0, 1, 2, 3, 4].map((day) => (
                <div
                  key={day}
                  className={cn(
                    'relative h-[280px] border-l border-navy-100 sm:h-[320px]',
                    day < 4 && 'hidden sm:block',
                  )}
                >
                  {[0, 1, 2, 3].map((row) => (
                    <span
                      key={row}
                      className="absolute inset-x-0 border-t border-navy-100"
                      style={{ top: `${row * 25}%` }}
                      aria-hidden
                    />
                  ))}
                  {day === 4 ? (
                    <button
                      type="button"
                      onClick={() => select(1)}
                      aria-label={`${confirmed ? 'Potvrzený termín' : 'Otevřít poptávku'}: Tereza Malá, pátek 9. října, 9:00 až 10:30`}
                      className={cn(
                        'absolute inset-x-1 top-0 flex h-[37.5%] min-h-[108px] flex-col gap-2 rounded-tiny p-2 text-left transition-colors duration-300 motion-reduce:transition-none',
                        confirmed
                          ? 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900'
                          : 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
                        focus,
                      )}
                    >
                      <span className="flex items-center gap-1 font-num text-[13px]">
                        9:00 {confirmed && <Check size={14} aria-hidden />}
                      </span>
                      <b className="text-base leading-tight">Tereza Malá</b>
                      <span className="text-sm">Barvení + střih</span>
                      <span className="mt-auto text-[13px]">
                        {confirmed ? 'Potvrzeno' : 'Nová poptávka'}
                      </span>
                    </button>
                  ) : day === 1 || day === 3 ? (
                    <div className="absolute inset-x-1 top-1/2 min-h-14 rounded-tiny border-l-[3px] border-navy-700 bg-navy-100 p-2 text-sm text-navy-900">
                      <span className="font-num text-[12px]">11:00</span>
                      <span className="mt-1 block">
                        {day === 1 ? 'Jana' : 'Marek'}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {step === 1 && (
            <div className="flex flex-col border-navy-100 bg-surface p-5 sm:p-6 xl:absolute xl:inset-y-0 xl:right-0 xl:w-[290px] xl:border-l">
              <span className="mb-5 self-start rounded-full border border-dashed border-signal-line bg-signal-bg px-3 py-1 text-sm text-signal-ink">
                Nová poptávka · z webu
              </span>
              <h3 className="text-2xl font-semibold tracking-[-0.02em]">
                Tereza Malá
              </h3>
              <p className="mt-1 text-base text-quiet">Barvení + střih</p>
              <dl className="mt-6 grid grid-cols-[1fr_auto] gap-y-3 text-base">
                <dt className="text-quiet">Termín</dt>
                <dd className="font-num">pá 9. 10.</dd>
                <dt className="text-quiet">Čas</dt>
                <dd className="font-num">9:00–10:30</dd>
              </dl>
              <p className="mt-5 flex items-center gap-2 text-base text-quiet">
                <Check size={16} aria-hidden />
                Termín je volný
              </p>
              <button
                type="button"
                onClick={() => select(2)}
                className={cn(
                  'mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-navy-700 px-4 font-semibold text-white hover:bg-navy-800',
                  focus,
                )}
              >
                Potvrdit termín
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-navy-100 bg-ground px-4 py-3 sm:px-6">
          <span role="status" className="text-sm text-quiet">
            {confirmed
              ? 'Potvrzeno. Tereza dostane e-mail.'
              : 'Fiktivní data. Zkuste si postup.'}
          </span>
          {confirmed ? (
            <a
              href="#ukazka-zakaznik"
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-base font-semibold text-navy-700',
                focus,
              )}
            >
              Zákaznice
              <ChevronRight size={16} aria-hidden />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => select(step === 1 ? 0 : 1)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-base font-semibold text-navy-700',
                focus,
              )}
            >
              {step === 1 ? 'Zpět do kalendáře' : STORY[step].action}
              <ChevronRight size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {reduced && (
        <span className="sr-only">
          Pohyb je vypnutý. Všechny kroky můžete procházet tlačítky.
        </span>
      )}
    </div>
  )
}
