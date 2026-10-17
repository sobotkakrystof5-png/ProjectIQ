// SEO landing page na jednom místě (S05, brief § 11): adresa webu, výchozí texty
// pro vyhledávače a sdílení, strukturovaná data. Fakta o ceně: R-018, R-038.
import type { Metadata } from 'next'
import { PRICE_LABEL } from './content'

/**
 * Veřejná adresa webu pro kanonické URL, sitemapu a Open Graph (R-017, R-030).
 * Musí odpovídat hlavní doméně v produkci (apex vs. www), jinak canonical míří jinam než web.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://zakaziq.cz').replace(/\/+$/, '')

export const SITE_NAME = 'ZakazIQ'
export const SITE_TITLE = 'ZakazIQ · poptávky, kalendář a zákazníci na jednom místě'
export const SITE_DESCRIPTION =
  'Poptávka z vašeho webu se sama zařadí do kalendáře a potvrdíte ji jedním klikem. Pro kadeřnictví, řemeslníky a malé firmy. 249 Kč měsíčně, prvních 14 dní zdarma.'

/** Společný základ Open Graph — stránka, která nastaví vlastní `openGraph`, ho musí rozbalit (Next je nespojuje). */
export const OPEN_GRAPH_BASE = {
  type: 'website',
  locale: 'cs_CZ',
  siteName: SITE_NAME,
} satisfies Metadata['openGraph']

/** Právní stránky mají zatím text [DOPLNIT] (R-023) — do vyplnění je nechceme ve výsledcích hledání. */
export const LEGAL_ROBOTS = { index: false, follow: true } satisfies Metadata['robots']

const PRICE_CZK = PRICE_LABEL.replace(/\D/g, '')

/**
 * JSON-LD pro úvodní stránku. Bez hodnocení a recenzí (žádné nemáme) a bez e-mailu
 * podpory, dokud je [DOPLNIT]. FAQPage záměrně ne: Google bohaté výsledky FAQ v roce 2026
 * zrušil a jedna odpověď má ještě [DOPLNIT].
 */
export function landingJsonLd() {
  const org = `${SITE_URL}/#organizace`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/zakaziq-logo.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#web`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: 'cs',
        publisher: { '@id': org },
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        inLanguage: 'cs',
        publisher: { '@id': org },
        offers: {
          '@type': 'Offer',
          price: PRICE_CZK,
          priceCurrency: 'CZK',
          url: `${SITE_URL}/#cenik`,
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: PRICE_CZK,
            priceCurrency: 'CZK',
            billingDuration: 'P1M',
            unitCode: 'MON',
          },
        },
      },
    ],
  }
}

/** JSON do `<script type="application/ld+json">`; `<` escapovaný, aby text nemohl ukončit značku. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
