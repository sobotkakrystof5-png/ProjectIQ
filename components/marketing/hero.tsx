import { BadgeCheck, Gift, MailCheck, Undo2 } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { CTA_LABEL, ROUTES, SUPPORT_MAILTO } from './content'
import { HeroBackdrop } from './hero-backdrop'
import { Header } from './header'
import { LiveDemo } from './live-demo'

/** Důvěra pod CTA: ikona (SVG z lucide) a krátký text. */
const TRUST = [
  { icon: Gift, label: '14 dní zdarma' },
  { icon: BadgeCheck, label: 'Vše v ceně' },
  { icon: Undo2, label: 'Zrušíte kdykoli' },
  { icon: MailCheck, label: 'Přihlášení bez hesla' },
] as const

/** Úvod Dílků s kalendářem a příběhem jedné ukázkové poptávky. */
export function Hero() {
  return (
    <section aria-label="Úvod" className="relative">
      {/* Společná tmavá plocha drží úvod a příběh pohromadě. */}
      <HeroBackdrop />

      <div className="relative">
        <Header variant="hero" />

        <div className="mx-auto max-w-[1200px] px-5 pt-10 sm:px-7 md:pt-16">
          <div className="flex max-w-[860px] flex-col items-start gap-6">
            {/* Nadpis a perex bez nájezdu — jsou LCP prvek, nesmí čekat na animaci. */}
            <AccentHeading as="h1" size="hero" onDark accent="na svém místě.">
              Každá poptávka
              <br />
            </AccentHeading>
            <p className="max-w-[620px] text-[19px] font-medium leading-relaxed text-white sm:text-[23px]">
              ZakazIQ je přehled podnikání pro malé firmy. Poptávky z webu,
              kalendář, zákazníci a věrnostní karty, zakázky, faktury a odhad
              daní v jedné aplikaci pro telefon i počítač.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 animate-zq-rise [animation-delay:240ms]">
              <a
                href={ROUTES.signUp}
                className="inline-flex min-h-[54px] items-center rounded-full bg-white px-7 text-lg font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50 sm:text-[19px]"
              >
                {CTA_LABEL}
              </a>
              <a
                href={SUPPORT_MAILTO}
                className="inline-flex min-h-[44px] items-center text-lg text-navy-100 underline decoration-navy-400 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
              >
                Napište nám
              </a>
            </div>
            <ul
              aria-label="Co je v ceně a jak to funguje"
              className="flex flex-wrap gap-2.5 animate-zq-rise [animation-delay:300ms]"
            >
              {TRUST.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-1.5 pr-4 text-[15px] font-medium text-white"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-navy-950">
                    <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 pb-16 md:mt-12">
            <LiveDemo />
          </div>
        </div>
      </div>
    </section>
  )
}
