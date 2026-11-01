/**
 * Content-Security-Policy pro celé repo (admin, Workspace, landing page).
 *
 * Skládá ji `proxy.ts` pro každý request zvlášť: náhodný nonce +
 * `strict-dynamic`, takže se spustí jen skripty, které vygeneroval náš server
 * (a skripty, které ony samy načtou — tak fungují chunky Nextu, Clerk i Stripe).
 * Next.js si nonce sám přečte z request hlavičky `Content-Security-Policy`
 * a dá ho na své `<script>` — ale jen u dynamicky renderovaných stránek.
 * Statická stránka nonce nemá a její skripty by vynucená CSP zablokovala,
 * proto je `/login` dynamický (`app/(auth)/login/layout.tsx`).
 *
 * Každá změna zdrojů → `.claude/security/CSP-LOG.md` (s funkcí, která ji
 * potřebuje) a řádek CSP v `.claude/security/STATE.md`. Nikdy `unsafe-inline`
 * ani `unsafe-eval` do `script-src` v produkci, nikdy `*`.
 */

export type CspProfile = 'admin' | 'workspace'

export type CspMode = 'enforce' | 'report-only'

type Directives = Record<string, string[]>

/** Cesty Workspace s profilem `workspace` (DECISIONS.md #003). */
const WORKSPACE_PREFIXES = ['/w', '/r', '/z', '/klient'] as const

/**
 * Landing page a její právní stránky — profil `workspace` jako přesné cesty (DECISIONS.md #007).
 * Nikdy prefix `/`: ten by chytil celý web včetně adminu.
 */
const WORKSPACE_PATHS = ['/', '/podminky', '/ochrana-udaju', '/zpracovatelska-smlouva'] as const

/** Prefix bez „vedlejších" shod: `/w` sedí na `/w` a `/w/…`, ne na `/wiki`. */
export function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Které CSP pro danou cestu. Workspace a landing page (layout `app/(marketing)` je
 * dynamický) profil `workspace`, všechno ostatní profil `admin`. Od S19 naostro
 * obojí (DECISIONS.md #001 → #015). Jedinou statickou stránkou bez nonce zůstává
 * výchozí 404 — HTML se zobrazí, jen se nehydratuje (DECISIONS.md #015).
 */
export function cspProfileFor(pathname: string): { profile: CspProfile; mode: CspMode } {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (WORKSPACE_PREFIXES.some((p) => hasPrefix(path, p)) || (WORKSPACE_PATHS as readonly string[]).includes(path)) {
    return { profile: 'workspace', mode: 'enforce' }
  }
  return { profile: 'admin', mode: 'enforce' }
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

/**
 * Host Frontend API Clerku z publishable key (`pk_test_…`/`pk_live_…` = base64
 * z `<host>$`). Dev instance je `*.clerk.accounts.dev`, produkce `clerk.<doména>`.
 * Neplatný klíč = `null`, CSP pak Clerk nepustí (selže zavřeně).
 */
export function clerkFrontendApiHost(publishableKey: string | undefined): string | null {
  const match = /^pk_(test|live)_([A-Za-z0-9+/=]+)$/.exec(publishableKey ?? '')
  if (!match) return null
  let decoded: string
  try {
    decoded = atob(match[2])
  } catch {
    return null
  }
  const host = decoded.endsWith('$') ? decoded.slice(0, -1) : ''
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? host.toLowerCase() : null
}

/**
 * Clerk (S07) jen pod /w a /klient (KP05) — přihlášení, registrace, aplikace. Landing page Clerk
 * nenačítá. Skript clerk-js jde z Frontend API s naším nonce (ClerkProvider
 * `dynamic`), Turnstile ho načte sám (strict-dynamic). Telemetrie je vypnutá
 * v `app/w/layout.tsx`, host clerk-telemetry.com proto není potřeba.
 */
function clerkSources(host: string): Directives {
  return {
    'connect-src': [`https://${host}`],
    'img-src': ['https://img.clerk.com'],
    // Bot ochrana při registraci (Cloudflare Turnstile v rámečku)
    'frame-src': ['https://challenges.cloudflare.com'],
  }
}

/** Zdroje navíc podle profilu. Jen konkrétní hosty, každý zapsaný v CSP-LOG.md. */
function extras(profile: CspProfile, pathname: string, clerkHost: string | null): Directives {
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
  if (clerkHost && (hasPrefix(pathname, '/w') || hasPrefix(pathname, '/klient'))) return clerkSources(clerkHost)
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
  /** Host Frontend API Clerku (`clerkFrontendApiHost`), pouští Clerk na /w. */
  clerkHost?: string | null
}

export function buildCsp({
  nonce,
  pathname,
  profile,
  mode,
  isDev = false,
  frameAncestors,
  clerkHost = null,
}: BuildCspOptions): string {
  let directives = merge(base(nonce, isDev), extras(profile, pathname, clerkHost))
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
