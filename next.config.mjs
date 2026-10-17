import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Kořen projektu. V domovské složce leží cizí package-lock.json, podle kterého by
// Next kořen odhadl špatně; Turbopack 16.2 navíc spadne na cestě s diakritikou
// (`Podnikání`), pokud je kořen nad projektem (panic v ident.rs).
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * Statické bezpečnostní hlavičky pro všechny odpovědi (stránky, API, soubory).
 * CSP se skládá per request v `proxy.ts` (nonce), tady není.
 * Stav a důvody každé výjimky: `.claude/security/STATE.md` a `DECISIONS.md`.
 */
const securityHeaders = [
  // `preload` zděděný z dřívější konfigurace — DECISIONS.md #005.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-XSS-Protection', value: '0' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
]

// Co se vkládá na weby klientů: objednávací stránka /r/[slug] (iframe, rámování
// řídí frame-ancestors z proxy.ts) a widget /embed/[slug].js + veřejné API
// /api/public/v1 (načítají se z cizí domény). DECISIONS.md #004.
const notEmbeddable = '/((?!r/|r$|embed/|api/public/v1/).*)'

// Do vyhledávačů smí jen landing page a právní stránky (S05). Aplikace, admin, API,
// objednávací stránky klientů, widget a portály (/z, /p, /h — odkazy s tokenem) dostanou
// noindex hlavičkou: funguje i pro soubory a přesměrování, kde meta značka není.
const notIndexed = '/:area(w|r|z|embed|api|dashboard|alteno|hub|login|p|h)/:path*'

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // PDF potřebuje skutečnou cestu k binárkám, bundler balíček nesmí přemístit.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/api/ws/*/faktury/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  experimental: {
    serverActions: {
      // PDF faktury chodí server actionou jako FormData. Výchozí 1 MB by
      // propustilo jen ty nejmenší. Strop aplikace je 4 MB (MAX_PDF_BYTES
      // v lib/invoice-constants.ts), tady je rezerva na multipart overhead.
      bodySizeLimit: '5mb',
    },
  },
  async headers() {
    // Při shodě více pravidel vyhrává pozdější hodnota stejné hlavičky.
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: notIndexed, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      {
        source: notEmbeddable,
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }],
      },
      {
        source: '/api/public/v1/:path*',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }],
      },
      {
        // Obrázek novinky ZakazIQ v e-mailu — webmail ho načítá z cizí domény (S17).
        source: '/z/novinky/:id/obrazek',
        headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }],
      },
      {
        // Náhled PDF faktury v <object> na /dashboard/faktury/[id] — stejný origin.
        source: '/api/invoices/:id/pdf',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ]
  },
}

export default nextConfig
