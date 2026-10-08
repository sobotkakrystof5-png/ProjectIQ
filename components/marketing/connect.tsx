'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { CONNECT_SLUG } from './content'
import { useRevealState } from './use-in-view'

// Cesty podle R-016 (objednávací stránka /r, widget /embed), doména R-030.
const LINES = [
  { label: '01 · odkaz pro objednání', code: `zakaziq.cz/r/${CONNECT_SLUG}` },
  { label: '02 · jeden řádek na web', code: `<script src="https://zakaziq.cz/embed/${CONNECT_SLUG}.js"></script>` },
  { label: '03 · web postavený v Claude Code', code: '„napoj formulář na ZakazIQ“' },
] as const

/**
 * Terminálová karta: tři cesty napojení se vypíšou postupně (jednou, když karta přijede
 * na obrazovku), u poslední bliká kurzor, nakonec řádek „napojení ověřeno".
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
    <div ref={ref} className="rounded-slab bg-navy-950 p-5 font-num text-[13px] text-navy-100 shadow-xl shadow-navy-950/20 sm:p-7 sm:text-sm">
      <div aria-hidden className="mb-6 flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-navy-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-navy-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-navy-700" />
      </div>
      <ol className="flex flex-col gap-5">
        {LINES.map((line, i) => (
          <li
            key={line.label}
            className={cn('flex flex-col gap-1.5 transition-opacity duration-500 ease-zq', i < shown ? 'opacity-100' : 'opacity-0')}
          >
            <span className="text-[11px] uppercase tracking-[0.1em] text-navy-400">{line.label}</span>
            <code className="break-all text-white">
              {line.code}
              {i === LINES.length - 1 && <span aria-hidden className="ml-0.5 inline-block h-[1.1em] w-[0.55em] translate-y-[3px] bg-navy-300 animate-zq-blink" />}
            </code>
          </li>
        ))}
      </ol>
      <p
        className={cn(
          'mt-6 flex items-center gap-2 border-t border-navy-800 pt-5 text-navy-200 transition-opacity duration-500 ease-zq',
          shown > LINES.length ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Check size={16} strokeWidth={1.5} className="text-navy-300" aria-hidden />
        napojení ověřeno · první poptávka přijata
      </p>
    </div>
  )
}

/** 05 Napojení na váš web (brief § 4.7). */
export function Connect() {
  return (
    <section id="napojeni" aria-labelledby="napojeni-title" className="mx-auto max-w-[1200px] px-5 pt-[72px] sm:px-7 md:pt-[120px]">
      <div className="grid items-center gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div className="flex flex-col gap-6">
          <SectionLabel number="05">Napojení na váš web</SectionLabel>
          <AccentHeading id="napojeni-title" as="h2" size="section" accent="a rovnou napojím.">
            Web vám postavím
          </AccentHeading>
          <p className="max-w-[480px] text-[17px] leading-relaxed text-quiet">
            Nemáte web? Dostanete stránku pro objednání a QR kód na pult. Máte web? Stačí jeden řádek kódu. Napojení si
            ověříte jedním klikem.
          </p>
        </div>
        <Terminal />
      </div>
    </section>
  )
}
