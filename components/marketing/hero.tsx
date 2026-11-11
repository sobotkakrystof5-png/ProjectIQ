import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AccentHeading } from '@/components/ws/brand'
import { CTA_LABEL, ROUTES, SUPPORT_FORM_HREF } from './content'
import { HeroBackdrop } from './hero-backdrop'
import { Header } from './header'
import { LiveDemo } from './live-demo'

/** Stručný řádek z briefu; stejná fakta zůstávají i v ceníku. */
const TRUST = ['14 dní zdarma', 'Kartu zadáte při registraci', 'Poté 249 Kč měsíčně', 'Zrušíte kdykoli'] as const

/** Úvod Dílků s kalendářem a příběhem jedné ukázkové poptávky. */
export async function Hero() {
  // Stav přihlášení se čte na serveru (AD06): landing page díky tomu
  // nenačítá NextAuth v prohlížeči a nevolá /api/auth/session.
  const signedIn = Boolean(await getServerSession(authOptions))
  return (
    <section aria-label="Úvod" className="relative">
      {/* Společná tmavá plocha drží úvod a příběh pohromadě. */}
      <HeroBackdrop />

      <div className="relative">
        <Header variant="hero" signedIn={signedIn} />

        <div className="mx-auto max-w-[1200px] px-5 pt-10 sm:px-7 md:pt-16">
          <div className="flex max-w-[860px] flex-col items-start gap-6">
            {/* Nadpis a perex bez nájezdu — jsou LCP prvek, nesmí čekat na animaci. */}
            <AccentHeading as="h1" size="hero" onDark>
              Každá poptávka na svém místě.
            </AccentHeading>
            <p className="max-w-[620px] text-[15px] font-normal leading-relaxed text-white sm:text-[17px]">
              Objednávka z webu se zařadí do kalendáře a vy ji potvrdíte jedním
              klikem. Ve stejné aplikaci máte zákazníky s věrnostními kartami,
              zakázky, faktury i odhad daní, na telefonu i na počítači.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 animate-zq-rise [animation-delay:240ms]">
              <a
                href={ROUTES.signUp}
                className="inline-flex min-h-[54px] items-center rounded-full bg-white px-7 text-lg font-semibold text-navy-950 transition-colors duration-200 ease-zq hover:bg-navy-50 sm:text-[19px]"
              >
                {CTA_LABEL}
              </a>
              <a
                href={SUPPORT_FORM_HREF}
                className="inline-flex min-h-[44px] items-center text-lg text-navy-100 underline decoration-navy-400 underline-offset-[6px] transition-colors hover:text-white hover:decoration-white"
              >
                Napište nám
              </a>
            </div>
            <ul
              aria-label="Podmínky zkušební doby"
              className="flex flex-wrap gap-x-2.5 gap-y-1 text-[14px] leading-relaxed text-navy-200 animate-zq-rise [animation-delay:300ms]"
            >
              {TRUST.map((label, i) => (
                <li key={label} className="inline-flex items-center whitespace-nowrap">
                  {label}{i < TRUST.length - 1 && <span className="ml-2 text-navy-500" aria-hidden>·</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pb-16 md:mt-12">
            <LiveDemo />
          </div>
        </div>
      </div>
    </section>
  )
}
