import { NextResponse, type NextRequest } from 'next/server'
import { clientIpFromHeaders, ipRateKey, UNKNOWN_IP } from './client-ip'
import { createMemoryLimiter, type MemoryLimiter } from './memory-limiter'

// Brána na vstupu `proxy.ts`: strop počtu požadavků z jedné IP za 10 s, dřív než
// se spustí Supabase nebo kterýkoli dotaz do databáze. Je to PRVNÍ vrstva
// aplikace — před ní je firewall platformy (Vercel WAF) a za ní databázové
// limity jednotlivých vstupů. Hodnoty jsou záměrně velkorysé: běžný člověk
// (i kancelář za jednou IP) se k nim nedostane, robot, který stránku zasypává,
// ano. Důvody a postup při útoku: `.claude/security/STATE.md` → Ochrana proti DDoS,
// DECISIONS #050.

const WINDOW_MS = 10_000

/** Požadavků na jednu IP (IPv6 po /64) za 10 s. */
export const FRONT_GATE_LIMITS = {
  /** Stránky, server actions a statické přesměrování. Prefetch odkazů v adminu jich pošle desítky naráz. */
  page: 240,
  /** `/api/ws` (živé obnovení po 10 s) a `/api/klient`. */
  api: 120,
} as const

export type FrontGateKind = keyof typeof FRONT_GATE_LIMITS

export function classifyPath(pathname: string): FrontGateKind {
  return pathname === '/api' || pathname.startsWith('/api/') ? 'api' : 'page'
}

export type FrontGateOptions = {
  /** Brána v testu zapnutá bez ohledu na prostředí. */
  enabled?: boolean
  now?: () => number
}

export type FrontGate = (req: NextRequest) => NextResponse | null

export function createFrontGate(options: FrontGateOptions = {}): FrontGate {
  const limiters: Record<FrontGateKind, MemoryLimiter> = {
    page: createMemoryLimiter({ max: FRONT_GATE_LIMITS.page, windowMs: WINDOW_MS }),
    api: createMemoryLimiter({ max: FRONT_GATE_LIMITS.api, windowMs: WINDOW_MS }),
  }

  return (req) => {
    const enabled =
      options.enabled ?? (process.env.NODE_ENV === 'production' && process.env.FRONT_GATE !== 'off')
    if (!enabled) return null

    const ip = clientIpFromHeaders(req.headers)
    // Bez IP by se všichni sdíleli jedno vědro a první robot by zamkl všechny.
    if (ip === UNKNOWN_IP) return null

    const result = limiters[classifyPath(req.nextUrl.pathname)].hit(ipRateKey(ip), options.now?.())
    if (!result.limited) return null

    return new NextResponse('Příliš mnoho požadavků. Zkuste to za chvíli.', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': String(result.retryAfterSec),
        'Cache-Control': 'no-store',
      },
    })
  }
}

/** Brána s paměti této instance funkce. */
export const frontGate: FrontGate = createFrontGate()
