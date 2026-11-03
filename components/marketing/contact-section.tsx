import { AccentHeading } from '@/components/ws/brand'
import { ContactForm } from './contact-form'

export function ContactSection() {
  return (
    <section id="kontakt" aria-labelledby="kontakt-title" className="mx-auto max-w-[1200px] px-5 pt-[56px] sm:px-7 md:pt-[96px]">
      <div className="grid gap-10 lg:grid-cols-[4fr_7fr] lg:gap-16">
        <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
          <AccentHeading id="kontakt-title" as="h2" size="section">
            Máte ještě nějaký dotaz?
          </AccentHeading>
          <p className="max-w-[38ch] text-lg leading-relaxed text-quiet">
            Napište ho sem a do 24 hodin vám odpovíme e-mailem.
          </p>
        </div>

        <div className="py-2 sm:py-4">
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
