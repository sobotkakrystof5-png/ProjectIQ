/**
 * Content-Security-Policy pro celé repo (admin, Workspace, landing page).
 *
 * Skládá ji `middleware.ts` pro každý request zvlášť: náhodný nonce +
 * `strict-dynamic`, takže se spustí jen skripty, které vygeneroval náš server
 * (a skripty, které ony samy načtou — tak fungují chunky Nextu, Clerk i Stripe).
 * Next.js si nonce sám přečte z request hlavičky `Content-Security-Policy`
 * a dá ho na své `<script>` — ale jen u dynamicky renderovaných stránek.
 * Statická stránka nonce nemá a její skripty by vynucená CSP zablokovala.
 *
 * Každá změna zdrojů → `.claude/security/CSP-LOG.md` (s funkcí, která ji
 * potřebuje) a řádek CSP v `.claude/security/STATE.md`. Nikdy `unsafe-inline`
 * ani `unsafe-eval` do `script-src` v produkci, nikdy `*`.
 */

export type CspProfile = 'admin' | 'workspace'

export type CspMode = 'enforce' | 'report-only'

type Directives = Record<string, string[]>

/** Cesty Workspace, kde CSP platí naostro (DECISIONS.md #003). */
const ENFORCED_PREFIXES = ['/w', '/r', '/z'] as const

/** Prefix bez „vedlejších" shod: `/w` sedí na `/w` a `/w/…`, ne na `/wiki`. */
export function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Které CSP pro danou cestu. Všechno mimo Workspace dostává admin profil
 * v Report-Only — admin běží v produkci, `/login` a 404 jsou statické (bez
 * nonce) a landing page zatím nemá stránky. Landing se přepne na `workspace`
 * v S04, až bude její layout dynamický (viz `.claude/security/STATE.md`).
 */
export function cspProfileFor(pathname: string): { profile: CspProfile; mode: CspMode } {
  if (ENFORCED_PREFIXES.some((p) => hasPrefix(pathname, p))) {
    return { profile: 'workspace', mode: 'enforce' }
  }
  return { profile: 'admin', mode: 'report-only' }
}

function base(nonce: string, isDev: boolean): Directives {
  return {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    // `https:` a `'self'` jsou jen záloha pro prohlížeče bez strict-dynamic,
    // moderní je ignorují. Dev potřebuje eval kvůli HMR a React DevTools.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", 'https:', ...(isDev ? ["'unsafe-eval'"] : [])],
    // Next.js vkládá kritické CSS inline, Framer Motion a Radix píší styly
    // za běhu (DECISIONS.md #002). Skripty zůstávají zamčené.
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'", 'data:'],
    'img-src': ["'self'", 'data:', 'blob:'],
    'connect-src': ["'self'", ...(isDev ? ['ws:', 'wss:'] : [])],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  }
}

/** Zdroje navíc podle profilu. Jen konkrétní hosty, každý zapsaný v CSP-LOG.md. */
function extras(profile: CspProfile, pathname: string): Directives {
  if (profile === 'admin') {
    return {
      // Inter přes @import v app/globals.css
      'style-src': ['https://fonts.googleapis.com'],
      'font-src': ['https://fonts.gstatic.com'],
      // TradingView graf v /hub/finance (components/TradingViewChart.tsx). Skript
      // z s3.tradingview.com pouští strict-dynamic, iframe jde z tohohle hostu.
      'frame-src': ['https://www.tradingview-widget.com'],
      // Náhled PDF faktury přes <object> (/dashboard/faktury/[id]) — Chrome ho
      // posuzuje jako rámec (frame-src), ostatní prohlížeče podle object-src.
      ...(hasPrefix(pathname, '/dashboard/faktury')
        ? { 'object-src': ["'self'"], 'frame-src': ["'self'", 'https://www.tradingview-widget.com'] }
        : {}),
    }
  }
  // S07: Clerk (skripty, frame a API domény instance) — doplnit sem + CSP-LOG.md.
  // S08: Stripe Checkout je přesměrování; pokud bude potřeba, `form-action https://checkout.stripe.com`.
  return {}
}

function merge(a: Directives, b: Directives): Directives {
  const out: Directives = { ...a }
  for (const [key, values] of Object.entries(b)) {
    const current = (out[key] ?? []).filter((v) => v !== "'none'")
    out[key] = values.includes("'none'") ? ["'none'"] : Array.from(new Set([...current, ...values]))
  }
  return out
}

export interface BuildCspOptions {
  nonce: string
  pathname: string
  profile: CspProfile
  mode: CspMode
  isDev?: boolean
  /** Hodnota `frame-ancestors` pro stránky vkládané na cizí weby (`/r/[slug]`). */
  frameAncestors?: string[]
}

export function buildCsp({ nonce, pathname, profile, mode, isDev = false, frameAncestors }: BuildCspOptions): string {
  let directives = merge(base(nonce, isDev), extras(profile, pathname))
  if (frameAncestors) directives = { ...directives, 'frame-ancestors': frameAncestors }

  const parts = Object.entries(directives).map(([key, values]) => `${key} ${values.join(' ')}`)
  // V Report-Only prohlížeč upgrade-insecure-requests ignoruje (a hlásí to do konzole),
  // na localhostu přes http by rozbil dev.
  if (mode === 'enforce' && !isDev) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

/** 128 bitů náhody, base64. Nový pro každý request — statický nonce = unsafe-inline. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
