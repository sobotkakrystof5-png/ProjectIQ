import 'server-only'
import { corsHeaders, normalizeOrigin, normalizeOrigins } from '@/lib/security/embed'
import { readBodyLimited } from '@/lib/security/request-body'
import { wsSystem } from '../db'
import { KeyConfigError, resolvePublicKey, resolveSecretKey, type ResolvedKey } from '../keys'
import { apiError, logIntake, type IntakeChannel, type IntakeResult } from './intake'

// Společné pro route handlery /api/public/v1/* (S11): ověření klíče, CORS
// a tvar odpovědi. Tajný klíč jen ze serveru (bez Origin), veřejný jen
// z povolené domény. Chyby { success: false, code, error } česky (B6).

export type Authenticated = {
  key: ResolvedKey
  channel: Extract<IntakeChannel, 'secret' | 'widget'>
  /** Ověřený origin widgetu (pro CORS a záznam), u tajného klíče null. */
  origin: string | null
}

export const MAX_BODY_BYTES = 64 * 1024

const bearer = (req: Request): string | null => {
  const auth = req.headers.get('authorization')
  return auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null
}

/** Veřejný klíč z `?key=` (widget, preflight ho jinak nevidí). */
export const publicKeyFrom = (req: Request): string | null => new URL(req.url).searchParams.get('key')

/**
 * Ověří, odkud požadavek je. Výsledek je buď napojení, nebo hotová chybová
 * odpověď. Selže zavřeně: chybí pepř → tajné klíče neprojdou.
 */
export async function authenticate(req: Request): Promise<Authenticated | IntakeResult> {
  const origin = req.headers.get('origin')
  const secret = bearer(req)

  if (secret) {
    // Tajný klíč z prohlížeče = klíč je ve stránce, kde ho vidí každý návštěvník.
    if (origin) {
      return apiError(
        401,
        'UNAUTHORIZED',
        'Tajný klíč patří jen na server webu, ne do prohlížeče. Vyměňte ho prosím v Nastavení › Napojený web.',
      )
    }
    try {
      const key = await resolveSecretKey(secret)
      if (!key) return apiError(401, 'UNAUTHORIZED', 'Klíč nesedí. Zkontrolujte prosím ZAKAZIQ_KEY v nastavení webu.')
      return { key, channel: 'secret', origin: null }
    } catch (e) {
      if (e instanceof KeyConfigError) {
        console.error('intake.auth: chybí WS_KEY_PEPPER')
        return apiError(503, 'NOT_CONFIGURED', 'Příjem poptávek je teď nedostupný. Zkuste to prosím později.')
      }
      throw e
    }
  }

  const pk = publicKeyFrom(req)
  if (!pk) return apiError(401, 'UNAUTHORIZED', 'Chybí klíč. Pošlete tajný klíč v hlavičce Authorization: Bearer.')
  const key = await resolvePublicKey(pk)
  if (!key) return apiError(401, 'UNAUTHORIZED', 'Klíč nesedí. Zkopírujte prosím kód widgetu znovu z Nastavení › Napojený web.')
  const normalized = origin ? normalizeOrigin(origin) : null
  if (!normalized || !normalizeOrigins(key.allowedOrigins).includes(normalized)) {
    // Do záznamu pro ladění (klíč je platný, víme čí je): „poptávka z nepovolené domény“.
    await logIntake(
      { accountId: key.accountId, businessId: key.businessId, integrationId: key.integrationId, channel: 'widget', origin: origin?.slice(0, 200) ?? null },
      { status: 403, code: 'FORBIDDEN_ORIGIN', requestId: null, isTest: false },
    )
    return apiError(
      403,
      'FORBIDDEN_ORIGIN',
      'Tahle doména nemá povolené posílat poptávky. Přidejte ji prosím v Nastavení › Napojený web.',
    )
  }
  return { key, channel: 'widget', origin: normalized }
}

export const isAuthenticated = (x: Authenticated | IntakeResult): x is Authenticated => 'key' in x

/** JSON odpověď s CORS (jen pro ověřený origin widgetu) a bez cache. */
export function respond(
  result: { status: number; body: unknown; replayed?: boolean },
  opts: { req: Request; allowedOrigins?: readonly string[]; cache?: string; headers?: Record<string, string> },
): Response {
  const headers = corsHeaders(opts.req.headers.get('origin'), opts.allowedOrigins ?? [])
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', opts.cache ?? 'no-store')
  if (result.replayed) headers.set('Idempotent-Replayed', 'true')
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v)
  if (result.status === 429) headers.set('Retry-After', '60')
  return new Response(JSON.stringify(result.body), { status: result.status, headers })
}

/** Tělo jako JSON s limitem velikosti. */
export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; result: IntakeResult }> {
  const bounded = await readBodyLimited(req, MAX_BODY_BYTES)
  if (!bounded.ok) {
    return { ok: false, result: apiError(413, 'INVALID_BODY', 'Poptávka je moc velká. Zkraťte prosím text.') }
  }
  const text = Buffer.from(bounded.bytes).toString('utf8')
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, result: apiError(400, 'INVALID_BODY', 'Tělo požadavku není platný JSON.') }
  }
}

export type PublicBusiness = { accountId: string; businessId: string; publicKey: string | null; allowedOrigins: string[] }

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Byznys podle veřejného slugu (/r/[slug], /embed/[slug].js). Neznámý = null. */
export async function businessBySlug(slug: string): Promise<PublicBusiness | null> {
  if (!SLUG_RE.test(slug) || slug.length > 60) return null
  const [row] = await wsSystem`SELECT * FROM ws.business_by_public_slug(${slug})`
  if (!row) return null
  return {
    accountId: String(row.account_id),
    businessId: String(row.business_id),
    publicKey: (row.public_key as string | null) ?? null,
    allowedOrigins: (row.allowed_origins as string[] | null) ?? [],
  }
}
