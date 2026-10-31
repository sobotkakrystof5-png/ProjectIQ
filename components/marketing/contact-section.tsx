import { AccentHeading, SectionLabel } from '@/components/ws/brand'
import { ContactForm } from './contact-form'

export function ContactSection() {
  return (
    <section id="kontakt" aria-labelledby="kontakt-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
          <SectionLabel number="08">Kontakt</SectionLabel>
          <AccentHeading id="kontakt-title" as="h2" size="section" accent="dotaz?">
            Máte ještě nějaký
          </AccentHeading>
          <p className="max-w-[38ch] text-lg leading-relaxed text-quiet">
            Napište nám. Ozveme se do 24 hodin.
          </p>
        </div>

        <div className="py-2 sm:py-4">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
