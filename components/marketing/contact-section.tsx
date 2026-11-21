import { AccentHeading } from '@/components/ws/brand'
import { ContactForm } from './contact-form'
import { SIGNUP_OPEN, TRY_ANCHOR } from './content'

export function ContactSection() {
  return (
    <section id="kontakt" aria-labelledby="kontakt-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      {/* Cíl tlačítka „Chci to vyzkoušet" (R-134): formulář podle kotvy předvyplní zprávu. */}
      {!SIGNUP_OPEN && <span id={TRY_ANCHOR} aria-hidden="true" className="block" />}
      <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
          <AccentHeading id="kontakt-title" as="h2" size="section">
            {SIGNUP_OPEN ? 'Máte ještě nějaký dotaz?' : 'Chcete to vyzkoušet?'}
          </AccentHeading>
          {SIGNUP_OPEN ? (
            <p className="max-w-[38ch] text-lg leading-relaxed text-quiet">
              Napište ho sem a do 24 hodin vám odpovíme e-mailem.
            </p>
          ) : (
            <p className="max-w-[38ch] text-lg leading-relaxed text-quiet">
              Přístup do ZakazIQ teď dávám firmám postupně a nastavuji ho s nimi osobně. Napište, jakou
              máte firmu, a do 24 hodin se vám ozvu. Dotaz sem můžete napsat taky.
            </p>
          )}
        </div>

        <div className="py-2 sm:py-4">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
