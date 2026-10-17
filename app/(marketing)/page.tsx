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
import {
  jsonLdString,
  landingJsonLd,
  OPEN_GRAPH_BASE,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from '@/components/marketing/seo'

// Titulek a popis dědí z layoutu (components/marketing/seo.ts), tady kanonická adresa a og:url.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { ...OPEN_GRAPH_BASE, url: '/', title: SITE_TITLE, description: SITE_DESCRIPTION },
}

// Landing page ZakazIQ podle docs/landing/PROJECT-BRIEF.md (pořadí sekcí R-031).
export default function LandingPage() {
  return (
    <>
      {/* Datový blok, ne skript — CSP ho nespouští ani neblokuje. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(landingJsonLd()) }} />
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
