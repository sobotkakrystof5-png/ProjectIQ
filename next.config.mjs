import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEGACY_REDIRECTS } from './lib/legacy-redirects.mjs'

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

const portalPermissionsPolicy = securityHeaders
  .find(h => h.key === 'Permissions-Policy')
  .value.replace('microphone=()', 'microphone=(self)')

// Co se vkládá na weby klientů: objednávací stránka /r/[slug] (iframe, rámování
// řídí frame-ancestors z proxy.ts) a widget /embed/[slug].js + veřejné API
// /api/public/v1 (načítají se z cizí domény). DECISIONS.md #004.
const notEmbeddable = '/((?!r/|r$|embed/|api/public/v1/).*)'

// Do vyhledávačů smí jen landing page a právní stránky (S05). Aplikace, admin, API,
// objednávací stránky klientů, widget a portály (/z, /p, /h — odkazy s tokenem) dostanou
// noindex hlavičkou: funguje i pro soubory a přesměrování, kde meta značka není.
const notIndexed = '/:area(w|r|z|klient|embed|api|dashboard|alteno|hub|login|p|h)/:path*'

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // `next dev` jinak připisuje vlastní blok do AGENTS.md. Ten soubor je
  // závazná pravidla projektu (R-047) — generovaný text by s nimi soupeřil
  // a při každém spuštění dev serveru špinil `git status`.
  agentRules: false,
  productionBrowserSourceMaps: false,
  turbopack: { root: projectRoot },
  outputFileTracingRoot: projectRoot,
  // PDF potřebuje skutečnou cestu k binárkám, bundler balíček nesmí přemístit.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    // lib/invoice-pdf/render.ts čte písma a tokeny za běhu přes readFile (152 kB).
    '/**': ['./lib/invoice-pdf/assets/**/*', './app/ws-tokens.css'],
    // Chromium jen tam, kde vzniká PDF faktury.
    '/api/ws/*/faktury/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    // Admin: faktura vystavená v adminu nemá uložené PDF, vyrábí se při stažení (AD12).
    '/api/invoices/*/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/z/*/faktura/*': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/w/ucet/export': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/w/*/faktury': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/cron/ws-email': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  experimental: {
    // Zpět a Vpřed v adminu po dobu 30 s nesahají do databáze (AD06). Dřív
    // každý návrat na seznam pustil všechny dotazy znovu — a to i když se
    // mezitím nic nestalo. Půl minuty je kompromis: data po akci se stejně
    // obnovují cíleně přes `revalidatePath`, takže po vlastní akci se stará
    // data neukážou — jen při prostém listování tam a zpět.
    staleTimes: { dynamic: 30, static: 180 },
    serverActions: {
      // PDF faktury chodí server actionou jako FormData. Výchozí 1 MB by
      // propustilo jen ty nejmenší. Strop aplikace je 4 MB (MAX_PDF_BYTES
      // v lib/invoice-constants.ts), tady je rezerva na multipart overhead.
      bodySizeLimit: '5mb',
    },
  },
  // Staré adresy adminu (dva inboxy, sekce /alteno) — seznam v
  // lib/legacy-redirects.mjs, aby šel otestovat. AD02, R-088.
  async redirects() {
    return LEGACY_REDIRECTS
  },
  async headers() {
    // Při shodě více pravidel vyhrává pozdější hodnota stejné hlavičky.
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Klient na portálu nadiktuje požadavek (S: požadavky klientů). Mikrofon jen pro
        // vlastní stránku, nikdy pro vložené rámce; zbytek politiky zůstává. DECISIONS.md #018.
        source: '/p/:path*',
        headers: [{ key: 'Permissions-Policy', value: portalPermissionsPolicy }],
      },
      {
        // Klientský prostor (KP07): stejná výjimka pro mikrofon jako /p.
        source: '/klient/:path*',
        headers: [{ key: 'Permissions-Policy', value: portalPermissionsPolicy }],
      },
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
