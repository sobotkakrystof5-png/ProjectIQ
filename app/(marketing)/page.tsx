import type { Metadata } from 'next'
import { Chaos } from '@/components/marketing/chaos'
import { ContactSection } from '@/components/marketing/contact-section'
import { Footer } from '@/components/marketing/footer'
import { Hero } from '@/components/marketing/hero'
import { Introduction } from '@/components/marketing/introduction'
import { OborMarquee } from '@/components/marketing/obor-marquee'
import { Pricing } from '@/components/marketing/pricing'
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

// Landing page ZakazIQ podle docs/landing/PROJECT-BRIEF.md. Za úvodem čtyři bloky (R-081):
// statistiky → představení → nabídka → poptávka. Nový obsah patří do jednoho z nich, ne do páté sekce.
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
        <Chaos />
        <Introduction />
        <Pricing />
        <ContactSection />
      </main>
      <Footer />
    </>
  )
}
