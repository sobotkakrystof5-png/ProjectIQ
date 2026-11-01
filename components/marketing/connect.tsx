'use client'

import { useEffect, useRef, useState } from 'react'
import { AccentHeading, SectionLabel, TileField } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { CONNECT_SLUG } from './content'
import { useRevealState } from './use-in-view'

// Cesty podle R-016 (objednávací stránka /r, widget /embed), doména R-030.
const LINES = [
  { label: 'Odkaz pro objednání', code: `zakaziq.cz/r/${CONNECT_SLUG}` },
  { label: 'Kód do webu', code: `<script src="https://www.zakaziq.cz/embed/${CONNECT_SLUG}.js"></script>` },
  { label: 'Pokyn pro web vytvořený v Claude Code', code: '„napoj formulář na ZakazIQ“' },
] as const

/**
 * Terminálová karta: tři cesty napojení se vypíšou postupně (jednou, když karta přijede
 * na obrazovku). Text ukazuje tři cesty bez předstírání úspěšného napojení.
 */
function Terminal() {
  const ref = useRef<HTMLDivElement>(null)
  // idle = bez JS, s prefers-reduced-motion nebo vidět hned při načtení → vše najednou.
  const reveal = useRevealState(ref, 0.4)
  const [step, setStep] = useState(0)
  const shown = reveal === 'idle' ? LINES.length + 1 : reveal === 'pending' ? 0 : step

  useEffect(() => {
    if (reveal !== 'shown' || step > LINES.length) return
    const id = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 200 : 650)
    return () => window.clearTimeout(id)
  }, [reveal, step])

  return (
    <div ref={ref} className="relative isolate overflow-hidden bg-navy-950 px-5 py-7 text-navy-100 sm:px-8 sm:py-9">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 overflow-hidden opacity-[0.16]">
        <TileField cols={18} rows={4} className="-left-2 -top-2" />
      </div>
      <ol className="relative flex flex-col gap-7">
        {LINES.map((line, i) => (
          <li
            key={line.label}
            className={cn('flex flex-col gap-1.5 transition-opacity duration-500 ease-zq', i < shown ? 'opacity-100' : 'opacity-0')}
          >
            <span className="text-sm text-navy-200">{line.label}</span>
            <code className="break-all font-num text-[16px] text-white">{line.code}</code>
          </li>
        ))}
      </ol>
      <p
        className={cn(
          'relative mt-7 text-[15px] leading-relaxed text-navy-200 transition-opacity duration-500 ease-zq',
          shown > LINES.length ? 'opacity-100' : 'opacity-0',
        )}
      >
        Vyberete si cestu, která odpovídá vašemu webu.
      </p>
    </div>
  )
}

/** 05 Napojení na váš web (brief § 4.7). */
export function Connect() {
  return (
    <section id="napojeni" aria-labelledby="napojeni-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <div className="grid items-center gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <SectionLabel number="05">Napojení na váš web</SectionLabel>
          <AccentHeading id="napojeni-title" as="h2" size="section" accent="a rovnou napojím.">
            Web vám postavím
          </AccentHeading>
          <p className="max-w-[480px] text-[19px] leading-relaxed text-quiet">
            Nemáte web? Dostanete stránku pro objednání a QR kód na pult. Máte web? Stačí jeden řádek kódu. Napojení si
            ověříte jedním klikem.
          </p>
        </div>
        <Terminal />
      </div>
    </section>
  )
}
