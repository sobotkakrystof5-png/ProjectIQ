/**
 * Content-Security-Policy pro celé repo (admin, Workspace, landing page).
 *
 * Skládá ji `proxy.ts` pro každý request zvlášť: náhodný nonce +
 * `strict-dynamic`, takže se spustí jen skripty, které vygeneroval náš server
 * (a skripty, které ony samy načtou — tak fungují chunky Nextu i Stripe).
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
 * Origin Supabase projektu z `NEXT_PUBLIC_SUPABASE_URL` (`https://<ref>.supabase.co`
 * nebo vlastní doména). Jen https a holý host bez cesty; cokoli jiného = `null`
 * a CSP Supabase nepustí (selže zavřeně).
 */
export function supabaseOrigin(url: string | undefined): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname))) return null
  if (parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '')) return null
  return parsed.origin
}

/** Kde prohlížeč volá Supabase Auth (přihlášení, registrace, obnova hesla, 2FA, zabezpečení účtu). */
const SUPABASE_AUTH_PATHS = ['/w', '/klient', '/login', '/dashboard/zabezpeceni'] as const

/**
 * Formuláře s ochranou proti botům (Cloudflare Turnstile, R-081): přihlášení,
 * registrace a obnova hesla všech tří částí. Skript Turnstile vkládá náš
 * skript (strict-dynamic), rámeček s ověřením potřebuje frame-src.
 */
const CAPTCHA_PATHS = [
  '/login',
  '/w/prihlaseni',
  '/w/registrace',
  '/w/zapomenute-heslo',
  '/klient/prihlaseni',
  '/klient/registrace',
  '/klient/zapomenute-heslo',
] as const

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * Supabase Auth (R-080): formuláře přihlášení volají `<ref>.supabase.co/auth/v1`
 * z prohlížeče (fetch → connect-src). Google přihlášení je přesměrování celé
 * stránky, CSP se ho netýká. Žádné skripty ani rámečky z cizích hostů.
 */
function supabaseSources(origin: string): Directives {
  return { 'connect-src': [origin] }
}

/** Zdroje navíc podle profilu. Jen konkrétní hosty, každý zapsaný v CSP-LOG.md. */
function extras(profile: CspProfile, pathname: string, supabase: string | null): Directives {
  const supabaseAuth = supabase && SUPABASE_AUTH_PATHS.some((p) => hasPrefix(pathname, p)) ? supabaseSources(supabase) : {}
  const captcha: Directives = CAPTCHA_PATHS.some((p) => hasPrefix(pathname, p)) ? { 'frame-src': [TURNSTILE_ORIGIN] } : {}
  const auth = merge(supabaseAuth, captcha)
  if (profile === 'admin') {
    return merge(auth, {
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
    })
  }
  // S08: Stripe Checkout je přesměrování; pokud bude potřeba, `form-action https://checkout.stripe.com`.
  return auth
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
  /** Origin Supabase (`supabaseOrigin`), pouští volání Supabase Auth z přihlašovacích formulářů. */
  supabaseOrigin?: string | null
}

export function buildCsp({
  nonce,
  pathname,
  profile,
  mode,
  isDev = false,
  frameAncestors,
  supabaseOrigin: supabase = null,
}: BuildCspOptions): string {
  let directives = merge(base(nonce, isDev), extras(profile, pathname, supabase))
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
