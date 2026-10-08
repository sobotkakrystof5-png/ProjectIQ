'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Mail, Instagram, BookOpen, Table2, type LucideIcon } from 'lucide-react'
import { zqEase } from '@/lib/ws/motion'
import { cn } from '@/lib/ws/utils'
import { SectionHead } from './section-head'
import { useRevealState } from './use-in-view'

interface Piece {
  icon: LucideIcon
  from: string
  text: string
  /** Rozházená poloha vlevo (desktop). */
  scatter: string
  /** Jak to vypadá v ZakazIQ. */
  tidy: { label: string; title: string; state: 'new' | 'confirmed' | 'plain' }
}

const PIECES: Piece[] = [
  {
    icon: MessageSquare,
    from: 'SMS',
    text: 'Dobrý den, máte v pátek volno?',
    scatter: 'md:left-[2%] md:top-[4%] md:-rotate-[4deg]',
    tidy: { label: 'Poptávka · SMS', title: 'pá 9:00 čeká na potvrzení', state: 'new' },
  },
  {
    icon: Instagram,
    from: 'Instagram',
    text: 'Kolik stojí melír?',
    scatter: 'md:left-[46%] md:top-[0%] md:rotate-[5deg]',
    tidy: { label: 'Poptávka · Instagram', title: 'Melír, dotaz na cenu', state: 'new' },
  },
  {
    icon: Mail,
    from: 'E-mail',
    text: 'Poptávka: výměna zámku',
    scatter: 'md:left-[8%] md:top-[36%] md:rotate-[2deg]',
    tidy: { label: 'Termín', title: 'st 9:00 výměna zámku', state: 'confirmed' },
  },
  {
    icon: BookOpen,
    from: 'Diář',
    text: '~~čt 14:00~~ Novák, přesunout',
    scatter: 'md:left-[50%] md:top-[40%] md:-rotate-[6deg]',
    tidy: { label: 'Kalendář', title: 'Novák přesunut na čt 16:00', state: 'confirmed' },
  },
  {
    icon: Table2,
    from: 'Tabulka',
    text: 'faktura 03: zaplaceno?',
    scatter: 'md:left-[22%] md:top-[70%] md:rotate-[3deg]',
    tidy: { label: 'Faktura 03', title: 'zaplaceno', state: 'plain' },
  },
]

/** Text kousku; `~~…~~` = přeškrtnutý termín v diáři. */
function PieceText({ text }: { text: string }) {
  const parts = text.split(/~~(.+?)~~/)
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <s key={i} className="decoration-quiet">{part}</s> : part))}
    </>
  )
}

/**
 * 01 Proč to řešit (R-031): vlevo rozházené kousky z telefonu, diáře a tabulky, vpravo totéž
 * srovnané v dílcích. Dílky se jednou poskládají, když sekce přijede na obrazovku.
 */
export function WhyBother() {
  const ref = useRef<HTMLDivElement>(null)
  const reveal = useRevealState(ref, 0.3)
  const hidden = reveal === 'pending'

  return (
    <section id="proc" aria-labelledby="proc-title" className="mx-auto max-w-[1200px] px-5 pt-[72px] sm:px-7 md:pt-[120px]">
      <SectionHead
        id="proc-title"
        number="01"
        label="Proč to řešit"
        title="Poptávky chodí odevšad."
        accent="Přehled máte na jednom místě."
      />
      <p className="mt-6 max-w-[620px] text-[17px] leading-relaxed text-quiet">
        Poptávka přijde esemeskou, další na Instagram a třetí do e-mailu. Termín skončí v diáři, faktura v tabulce a kdo
        dlouho nepřišel, to si nikdo nepamatuje. ZakazIQ jsem udělal, aby tohle všechno leželo na jedné obrazovce.
      </p>

      <div ref={ref} className="mt-12 grid gap-10 md:grid-cols-[5fr_7fr] md:gap-8">
        {/* Dnes */}
        <div>
          <p className="font-num text-xs uppercase tracking-[0.12em] text-quiet">Dnes</p>
          <ul className="mt-4 flex flex-col gap-3 md:relative md:h-[360px]">
            {PIECES.map(({ icon: Icon, from, text, scatter }) => (
              <li
                key={from}
                className={cn(
                  'flex max-w-[280px] items-start gap-3 rounded-chip border border-navy-100 bg-surface px-3.5 py-3 text-[15px] text-quiet shadow-sm shadow-navy-950/5 md:absolute',
                  scatter,
                )}
              >
                <Icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-navy-400" aria-hidden />
                <span>
                  <span className="block font-num text-[11px] uppercase tracking-[0.08em] text-navy-400">{from}</span>
                  <PieceText text={text} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Se ZakazIQ */}
        <div>
          <p className="font-num text-xs uppercase tracking-[0.12em] text-navy-500">Se ZakazIQ</p>
          <div className="mt-4 rounded-slab border border-navy-100 bg-surface p-3 sm:p-4">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {PIECES.map(({ from, tidy }, i) => (
                <motion.li
                  key={from}
                  initial={false}
                  animate={hidden ? { opacity: 0, x: -24 } : { opacity: 1, x: 0 }}
                  transition={{ duration: 0.7, ease: zqEase, delay: hidden ? 0 : i * 0.08 }}
                  className={cn(
                    'flex min-h-[84px] flex-col justify-between gap-2 rounded-box p-4',
                    tidy.state === 'new' && 'border-[1.5px] border-dashed border-signal-line bg-signal-bg text-signal-ink',
                    tidy.state === 'confirmed' && 'border-l-[3px] border-navy-700 bg-navy-100 text-navy-900',
                    tidy.state === 'plain' && 'bg-navy-50 text-ink',
                    i === PIECES.length - 1 && 'sm:col-span-2',
                  )}
                >
                  <span className="font-num text-[11px] uppercase tracking-[0.08em] opacity-75">{tidy.label}</span>
                  <span className="text-[15px] font-semibold leading-snug">{tidy.title}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
