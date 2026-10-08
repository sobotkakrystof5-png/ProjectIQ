'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmedBlock, LoyaltyCard, NewRequestBlock, SectionLabel } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { SectionHead } from './section-head'
import { useInView, useReducedMotion } from './use-in-view'

// Ukázkové termíny (pražský čas): čt 8. 10. 16:00, pá 9. 10. 9:00.
const MAREK_START = '2026-10-08T14:00:00Z'
const MAREK_END = '2026-10-08T14:45:00Z'
const TEREZA_START = '2026-10-09T07:00:00Z'
const TEREZA_END = '2026-10-09T08:30:00Z'

/** Výšky sloupců grafu příjmů v % — ilustrace, žádná skutečná data. */
const BARS = [46, 58, 40, 64, 80, 96]
const MONTHS = ['kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj']

function UkazkaChip() {
  return (
    <span className="rounded-full bg-surface/80 px-2 py-0.5 font-num text-[10px] uppercase tracking-[0.12em] text-quiet">
      ukázka
    </span>
  )
}

/** Karta 1: nová poptávka přijede pod potvrzený termín, když karta přijede na obrazovku. */
function RequestsIllustration() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, threshold: 0.4 })
  const reduced = useReducedMotion()
  const show = inView || reduced
  return (
    <div ref={ref} className="flex h-full flex-col gap-3">
      <ConfirmedBlock start={MAREK_START} end={MAREK_END} customer="Marek Dušek" service="Pánský střih" />
      <div className="min-h-[132px]">
        {show && (
          <NewRequestBlock start={TEREZA_START} end={TEREZA_END} customer="Tereza Malá" service="Barvení + střih" appear>
            <span className="inline-flex h-9 items-center rounded-full bg-navy-700 px-4 text-sm font-semibold text-white">
              Potvrdit jedním klikem
            </span>
          </NewRequestBlock>
        )}
      </div>
    </div>
  )
}

/** Karta 2: razítka přibývají, dokud není karta plná. */
function LoyaltyIllustration() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, threshold: 0.4 })
  const reduced = useReducedMotion()
  const [stamps, setStamps] = useState(2)

  useEffect(() => {
    if (reduced) {
      setStamps(5)
      return
    }
    if (!inView) return
    const id = window.setInterval(() => {
      setStamps((s) => {
        if (s >= 5) window.clearInterval(id)
        return Math.min(s + 1, 5)
      })
    }, 700)
    return () => window.clearInterval(id)
  }, [inView, reduced])

  return (
    <div ref={ref} className="flex h-full items-center justify-center">
      <LoyaltyCard customer="Tereza Malá" stamps={stamps} total={5} reward="střih zdarma" business="Věrnostní karta" />
    </div>
  )
}

/** Karta 3: sloupce příjmů vyrostou zdola (`zq-grow`, stagger 120 ms), jednou. */
function MoneyIllustration() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, threshold: 0.4 })
  return (
    <div ref={ref} className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-num text-[11px] uppercase tracking-[0.12em] text-quiet">Příjmy · kvě–říj</span>
        <UkazkaChip />
      </div>
      <div className="flex h-[120px] items-end gap-2">
        {BARS.map((h, i) => (
          <div key={MONTHS[i]} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            <span
              className={cn(
                'block origin-bottom rounded-t-[6px] rounded-b-[3px]',
                i === BARS.length - 1 ? 'bg-navy-700' : 'bg-navy-200',
                inView ? 'animate-zq-grow' : 'scale-y-0 motion-reduce:scale-y-100',
              )}
              style={{ height: `${h}%`, animationDelay: inView ? `${i * 120}ms` : undefined }}
            />
            <span className="text-center font-num text-[10px] text-quiet">{MONTHS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureCard({
  number,
  label,
  title,
  text,
  className,
  illustrationClassName,
  children,
}: {
  number: string
  label: string
  title: string
  text: string
  className?: string
  illustrationClassName?: string
  children: React.ReactNode
}) {
  return (
    <article className={cn('flex flex-col overflow-hidden rounded-panel border border-navy-100 bg-surface', className)}>
      <div aria-hidden className={cn('relative bg-navy-50 p-5 sm:p-6', illustrationClassName)}>
        {children}
      </div>
      <div className="flex flex-col gap-2 p-5 sm:p-6">
        <SectionLabel number={number}>{label}</SectionLabel>
        <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px]">{title}</h3>
        <p className="max-w-[46ch] text-[15px] leading-relaxed text-quiet sm:text-base">{text}</p>
      </div>
    </article>
  )
}

/** 02 Co to umí — tři karty, každá s vlastní kompozicí a ilustrací z aplikace (brief § 4.4). */
export function Features() {
  return (
    <section id="funkce" aria-labelledby="funkce-title" className="mx-auto max-w-[1200px] px-5 pt-[72px] sm:px-7 md:pt-[120px]">
      <SectionHead id="funkce-title" number="02" label="Co to umí" title="Tři věci, které vám" accent="vrátí čas." />

      <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:grid-rows-2">
        <FeatureCard
          number="01"
          label="Poptávky"
          title="Poptávka rovnou v kalendáři"
          text="Z webu, e-shopu i telefonu. Potvrdíte ji v aplikaci nebo přímo z e-mailu."
          className="lg:col-span-2 lg:row-span-2"
          illustrationClassName="flex flex-1 flex-col justify-center sm:p-10 lg:px-16 lg:py-14"
        >
          <div className="mx-auto w-full max-w-[420px]">
            <RequestsIllustration />
          </div>
        </FeatureCard>
        <FeatureCard
          number="02"
          label="Zákazníci"
          title="Zákazníci se vracejí"
          text="Karta se razítkuje sama. A když někdo dlouho nepřišel, ZakazIQ vám řekne, komu napsat."
        >
          <LoyaltyIllustration />
        </FeatureCard>
        <FeatureCard
          number="03"
          label="Peníze"
          title="Víte, kolik vyděláváte"
          text="Faktury, příjmy, výdaje a odhad daní. Každý měsíc vám přijde přehled e-mailem."
        >
          <MoneyIllustration />
        </FeatureCard>
      </div>
    </section>
  )
}
