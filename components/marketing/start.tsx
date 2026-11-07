import { Logo } from '@/components/ws/brand'
import { CTA_LABEL, ROUTES, START_STEPS, SUPPORT_EMAIL, SUPPORT_MAILTO } from './content'
import { SectionHead } from './section-head'

/**
 * Začátek: tři kroky od registrace k první poptávce a krátký vzkaz zakladatele.
 * Žádné počty klientů ani recenze (nemáme), jen co se po registraci skutečně stane.
 */
export function Start() {
  return (
    <section id="zacatek" aria-labelledby="zacatek-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <div className="grid gap-10 rounded-slab bg-navy-50 p-6 sm:p-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:p-14">
        <div>
          <SectionHead id="zacatek-title" title="Do tří minut máte odkaz na objednání." />
          <ol className="mt-8 flex flex-col gap-6 md:mt-10">
            {START_STEPS.map((step) => (
              <li key={step.n} className="grid grid-cols-[48px_minmax(0,1fr)] gap-4 border-t border-navy-200/70 pt-6">
                <span className="font-num text-[15px] font-medium text-navy-500">{step.n}</span>
                <div>
                  <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] sm:text-[22px]">{step.title}</h3>
                  <p className="mt-2 max-w-[52ch] text-[16px] leading-relaxed text-quiet">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <a
            href={ROUTES.signUp}
            className="mt-10 inline-flex min-h-[54px] items-center justify-center rounded-full bg-navy-700 px-7 text-lg font-semibold text-white transition-colors duration-200 ease-zq hover:bg-navy-800"
          >
            {CTA_LABEL}
          </a>
        </div>

        <aside aria-label="Vzkaz zakladatele" className="flex flex-col justify-between gap-8 rounded-panel bg-surface p-6 sm:p-8 lg:self-start">
          <div className="flex flex-col gap-5">
            <Logo size={34} />
            <p className="text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">
              ZakazIQ stavím sám, pro firmy, kterým dělám weby.
            </p>
            <p className="text-[16px] leading-relaxed text-quiet">
              Každý dotaz čtu já a odpovídám do 24 hodin. Když vám něco v aplikaci chybí nebo překáží, napište mi to.
              Je to nejkratší cesta, jak se ZakazIQ zlepší.
            </p>
          </div>
          <div className="flex flex-col gap-1 border-t border-navy-100 pt-5 text-[15px]">
            <span className="font-semibold text-ink">Kryštof Sobotka, zakladatel</span>
            <a href={SUPPORT_MAILTO} className="font-num text-navy-700 underline-offset-4 hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </aside>
      </div>
    </section>
  )
}
