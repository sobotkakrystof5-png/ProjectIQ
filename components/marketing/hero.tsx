import { AccentHeading, TileField } from '@/components/ws/brand'
import { CTA_LABEL, ROUTES, SUPPORT_MAILTO } from './content'
import { Header } from './header'
import { ArrivedBadge, DemoTickProvider, LiveDemo } from './live-demo'

/**
 * Úvod: tmavé pole dílků, nadpis zarovnaný doleva a živá ukázka, která spodní částí
 * přetéká přes hranu tmavé plochy na světlé pozadí (brief § 4.1).
 */
export function Hero() {
  return (
    <section aria-label="Úvod" className="relative">
      {/* Tmavá plocha končí nad spodkem sekce — ukázka přes ni přetéká. */}
      <div className="absolute inset-x-0 bottom-[120px] top-0 overflow-hidden rounded-b-hero bg-navy-950 md:bottom-[150px]">
        <TileField cols={32} rows={20} className="-left-2 -top-2" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-[38%] top-[34%] h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgb(var(--navy-500)/0.32),transparent)]"
        />
      </div>

      <div className="relative">
        <Header variant="hero" />

        <DemoTickProvider className="mx-auto max-w-[1200px] px-5 pt-10 sm:px-7 md:pt-16">
          <div className="flex max-w-[860px] flex-col items-start gap-6">
            {/* Nadpis a perex bez nájezdu — jsou LCP prvek, nesmí čekat na animaci. */}
            <ArrivedBadge className="animate-zq-rise" />
            <AccentHeading
              as="h1"
              size="hero"
              onDark
              accent="na svém místě."
            >
              Každá poptávka
              <br />
            </AccentHeading>
            <p className="max-w-[600px] text-[17px] leading-relaxed text-navy-200 sm:text-[19px]">
              Poptávka z vašeho webu se sama zařadí do kalendáře. Potvrdíte ji jedním klikem a o e-mail, připomínku
              i razítko na věrnostní kartu se postará ZakazIQ.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 animate-zq-rise [animation-delay:240ms]">
              <a
                href={ROUTES.signUp}
                className="inline-flex min-h-[54px] items-center rounded-full bg-white px-7 text-base font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50 sm:text-[17px]"
              >
                {CTA_LABEL}
              </a>
              <a
                href={SUPPORT_MAILTO}
                className="inline-flex min-h-[44px] items-center text-base text-navy-100 underline decoration-navy-400 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
              >
                Napište nám
              </a>
            </div>
            <p className="font-num text-xs text-navy-300 animate-zq-rise [animation-delay:300ms]">
              14 dní zdarma · vše v ceně · zrušíte kdykoli · přihlášení bez hesla
            </p>
          </div>

          <div className="mt-12 animate-zq-rise [animation-delay:380ms] md:mt-16 md:pr-6 lg:pr-0">
            <LiveDemo />
          </div>
        </DemoTickProvider>
      </div>
    </section>
  )
}
