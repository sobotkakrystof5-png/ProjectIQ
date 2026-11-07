import { AccentHeading } from '@/components/ws/brand'
import { ContactForm } from './contact-form'
import { Faq } from './faq'

/**
 * Blok 4 ze 4, Poptávka (R-081): jasný konec stránky. Vlevo nadpis a tři krátké dotazy,
 * vpravo formulář. Na telefonu jsou dotazy sbalené nad formulářem, formulář je poslední.
 */
export function ContactSection() {
  return (
    <section id="kontakt" aria-labelledby="kontakt-title" className="mx-auto max-w-[1200px] px-5 pt-[72px] sm:px-7 md:pt-[120px]">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col lg:col-span-5">
          <AccentHeading id="kontakt-title" as="h2" size="section">
            Máte ještě nějaký dotaz?
          </AccentHeading>
          <p className="mt-6 max-w-[38ch] text-lg leading-relaxed text-quiet">
            Napište ho sem a do 24 hodin vám odpovíme e-mailem.
          </p>
          <Faq className="mt-10" />
        </div>

        <div className="rounded-slab bg-surface p-5 sm:p-8 md:p-10 lg:col-span-7 lg:self-start">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
