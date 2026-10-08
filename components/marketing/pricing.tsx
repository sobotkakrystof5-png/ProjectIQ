import { Check } from 'lucide-react'
import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { CTA_LABEL, PRICE_INCLUDES, ROUTES } from './content'

/** Statické pole dílků 56 px za cenou: každý pátý plný, ostatní jen obrys (LP-D). */
function PriceTiles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 grid content-start gap-2.5 opacity-[0.08]"
      style={{ gridTemplateColumns: 'repeat(24, 56px)' }}
    >
      {Array.from({ length: 24 * 10 }, (_, k) => (
        <span key={k} className={cn('block h-14 w-14 rounded-chip', (k * 7) % 5 === 0 ? 'bg-white' : 'border border-white/70')} />
      ))}
    </div>
  )
}

/** 06 Ceník — jedna cena, žádné balíčky (R-018, R-019, R-026). */
export function Pricing() {
  return (
    <section id="cenik" aria-labelledby="cenik-title" className="mx-auto max-w-[1200px] px-3 pt-[72px] sm:px-7 md:pt-[120px]">
      <div className="relative grid overflow-hidden rounded-slab bg-navy-950 text-white lg:grid-cols-2">
        <div className="relative overflow-hidden px-5 py-12 sm:px-10 md:py-16">
          <PriceTiles />
          <div className="relative flex flex-col gap-6">
            <SectionLabel number="06" onDark>
              Ceník
            </SectionLabel>
            <AccentHeading id="cenik-title" as="h2" size="section" accent="Žádné balíčky." onDark>
              Jedna cena.
            </AccentHeading>
            <p className="flex items-baseline gap-3">
              <span className="font-num text-[72px] font-medium leading-none tracking-[-0.05em] sm:text-[96px]">249</span>
              <span className="text-xl text-navy-200 sm:text-2xl">
                <span className="font-num text-white">Kč</span> / měsíc
              </span>
            </p>
            <p className="max-w-[420px] font-num text-xs leading-relaxed text-navy-300">
              konečná cena, nic se nepřipočítává · 14 dní zdarma bez karty · zrušíte kdykoli · karta, Apple Pay, Google Pay
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-8 border-t border-navy-800 px-5 py-12 sm:px-10 md:py-16 lg:border-l lg:border-t-0">
          <div>
            <h3 className="font-num text-xs uppercase tracking-[0.12em] text-navy-400">V ceně</h3>
            <ul className="mt-5 flex flex-col gap-3.5">
              {PRICE_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[17px] text-navy-50">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-navy-800">
                    <Check size={14} strokeWidth={1.5} className="text-navy-200" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <a
            href={ROUTES.signUp}
            className="inline-flex min-h-[54px] items-center justify-center self-start rounded-full bg-white px-7 text-base font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50 sm:text-[17px]"
          >
            {CTA_LABEL}
          </a>
        </div>
      </div>
    </section>
  )
}
