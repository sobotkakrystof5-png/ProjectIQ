import { Check } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { cn } from '@/lib/ws/utils'
import { CTA_LABEL, PRICE_INCLUDES, PRICE_PER_DAY_LABEL, ROUTES } from './content'

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

/** 06 Ceník — jedna cena, žádné balíčky (R-018, R-026, R-038). */
export function Pricing() {
  return (
    <section id="cenik" aria-labelledby="cenik-title" className="mx-auto max-w-[1200px] px-3 pt-[56px] sm:px-7 md:pt-[96px]">
      <div className="relative grid overflow-hidden rounded-slab bg-navy-950 text-white lg:grid-cols-2">
        <div className="relative overflow-hidden px-5 py-12 sm:px-10 md:py-16">
          <PriceTiles />
          <div className="relative flex flex-col gap-6">
            <AccentHeading id="cenik-title" as="h2" size="section" onDark>
              Všechny funkce za jednu cenu.
            </AccentHeading>
            <p className="flex items-baseline gap-3">
              <span className="font-num text-[72px] font-medium leading-none tracking-[-0.05em] sm:text-[96px]">249</span>
              <span className="text-xl text-navy-200 sm:text-2xl">
                <span className="font-num text-white">Kč</span> / měsíc
              </span>
            </p>
            <p className="font-num text-[15px] text-navy-300">To je {PRICE_PER_DAY_LABEL}.</p>
            <p className="max-w-[420px] text-base leading-relaxed text-navy-200">
              Konečná cena, nic se nepřipočítává. Kartu zadáte při registraci; první platba proběhne až po 14 dnech.
              Zrušíte kdykoli.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-8 border-t border-navy-800 px-5 py-12 sm:px-10 md:py-16 lg:border-l lg:border-t-0">
          <div>
            <h3 className="text-lg font-semibold text-white">Co je v ceně</h3>
            <ul className="mt-5 flex flex-col gap-3.5">
              {PRICE_INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[19px] text-navy-50">
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
            className="inline-flex min-h-[54px] items-center justify-center self-start rounded-full bg-white px-7 text-lg font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50 sm:text-[19px]"
          >
            {CTA_LABEL}
          </a>
        </div>
      </div>
    </section>
  )
}
