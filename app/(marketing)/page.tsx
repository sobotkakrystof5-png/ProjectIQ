import type { Metadata } from 'next'
import { Connect } from '@/components/marketing/connect'
import { Faq } from '@/components/marketing/faq'
import { Features } from '@/components/marketing/features'
import { Footer } from '@/components/marketing/footer'
import { Hero } from '@/components/marketing/hero'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { Modules } from '@/components/marketing/modules'
import { OborMarquee } from '@/components/marketing/obor-marquee'
import { Pricing } from '@/components/marketing/pricing'
import { WhyBother } from '@/components/marketing/why-bother'

// Základní metadata. Klíčová slova, Open Graph a strukturovaná data doplní S05 (brief § 11).
export const metadata: Metadata = {
  title: 'ZakazIQ · poptávky, kalendář a zákazníci na jednom místě',
  description:
    'Poptávka z vašeho webu se sama zařadí do kalendáře a potvrdíte ji jedním klikem. Pro kadeřnictví, řemeslníky a malé firmy. 249 Kč měsíčně, 14 dní zdarma bez karty.',
}

// Landing page ZakazIQ podle docs/landing/PROJECT-BRIEF.md (pořadí sekcí R-031).
export default function LandingPage() {
  return (
    <>
      <a
        href="#obsah"
        className="sr-only z-50 rounded-full bg-white px-5 py-3 font-semibold text-navy-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Přeskočit na obsah
      </a>
      <Hero />
      <main id="obsah">
        <OborMarquee />
        <WhyBother />
        <Features />
        <HowItWorks />
        <Modules />
        <Connect />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </>
  )
}
