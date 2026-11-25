import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { adminDb } from '@/lib/admin/db'
import { decryptSecret, encryptSecret } from '@/lib/admin/google/crypto'

/**
 * Propojení Google účtu Kryštofa (Workspace vizeon.cz) s adminem (R-112).
 *
 * Jen to nejmenší oprávnění: `calendar.events` (založit a smazat událost
 * s Meetem), `gmail.compose` (koncept e-mailu po schůzce, R-144) a `email`
 * (ukázat, který účet je propojený). Klient OAuth je
 * v Google Cloud typu „Internal" — jen účty z Workspace, obnovovací token
 * nevyprší po 7 dnech jako u aplikace v režimu „Testing".
 *
 * Prohlížeč na Google sahá jen přesměrováním na přihlášení; tokeny vyměňuje
 * a drží server, takže CSP se nemění.
 */

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  // Koncept e-mailu klientovi po schůzce (R-144). Kód volá jen `drafts`, nic
  // neodesílá; propojení bez tohoto oprávnění funguje dál, jen bez konceptů.
  'https://www.googleapis.com/auth/gmail.compose',
] as const

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

export type Fetch = typeof fetch

function clientConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Chybí GOOGLE_CLIENT_ID nebo GOOGLE_CLIENT_SECRET.')
  return { clientId, clientSecret }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_KEY)
}

export function redirectUri(origin: string): string {
  return `${origin}/api/google/callback`
}

/** Náhodný `state` (proti CSRF) a PKCE ověřovač. Oba jdou do HttpOnly cookie. */
export function newAuthRequest(origin: string): { url: string; state: string; verifier: string } {
  const { clientId } = clientConfig()
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    // Bez `consent` Google při opakovaném propojení obnovovací token nepošle.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return { url: `${AUTH_URL}?${params.toString()}`, state, verifier }
}

const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
})

async function postToken(body: Record<string, string>, fetchImpl: Fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) {
    const err = new Error(`Google token: ${String(json?.error ?? res.status)}`)
    ;(err as Error & { googleError?: string }).googleError = String(json?.error ?? '')
    throw err
  }
  return tokenResponse.parse(json)
}

/**
 * E-mail z `id_token`. Token přišel přímo z token endpointu Googlu přes TLS
 * (ne z prohlížeče), proto se podpis neověřuje — slouží jen k zobrazení.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      email?: unknown
    }
    return typeof payload.email === 'string' ? payload.email.slice(0, 254) : null
  } catch {
    return null
  }
}

export type StoredGoogle = {
  email: string | null
  refresh_token: string // zašifrovaný
  scope: string
  connected_at: string
}

const storedSchema = z.object({
  email: z.string().nullable(),
  refresh_token: z.string().min(1),
  scope: z.string(),
  connected_at: z.string(),
})

/** Výměna kódu z přesměrování za tokeny a uložení do `admin_settings`. */
export async function completeAuth(
  code: string,
  verifier: string,
  origin: string,
  fetchImpl: Fetch = fetch,
): Promise<{ email: string | null }> {
  const { clientId, clientSecret } = clientConfig()
  const tokens = await postToken(
    {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    },
    fetchImpl,
  )
  if (!tokens.refresh_token) throw new Error('Google neposlal obnovovací token. Zkuste propojení znovu.')
  if (!tokens.scope?.includes('calendar.events')) {
    throw new Error('Google nepovolil přístup ke kalendáři. Při propojení ho prosím zaškrtněte.')
  }
  const stored: StoredGoogle = {
    email: emailFromIdToken(tokens.id_token),
    refresh_token: encryptSecret(tokens.refresh_token),
    scope: tokens.scope,
    connected_at: new Date().toISOString(),
  }
  await adminDb`
    INSERT INTO admin_settings (id, google_oauth) VALUES (true, ${JSON.stringify(stored)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET google_oauth = EXCLUDED.google_oauth, updated_at = now()
  `
  accessCache = { token: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
  return { email: stored.email }
}

async function loadStored(): Promise<StoredGoogle | null> {
  try {
    const rows = await adminDb<{ google_oauth: unknown }>`SELECT google_oauth FROM admin_settings WHERE id = true`
    const parsed = storedSchema.safeParse(rows[0]?.google_oauth)
    return parsed.success ? parsed.data : null
  } catch (err) {
    // Bez migrace 115 sloupec není — Google prostě není propojený.
    if ((err as { code?: string })?.code === '42703') return null
    throw err
  }
}

export type GoogleStatus =
  | { configured: false }
  | { configured: true; connected: false }
  | { configured: true; connected: true; email: string | null; connectedAt: string }

export async function googleStatus(): Promise<GoogleStatus> {
  if (!googleConfigured()) return { configured: false }
  const stored = await loadStored()
  return stored
    ? { configured: true, connected: true, email: stored.email, connectedAt: stored.connected_at }
    : { configured: true, connected: false }
}

/** Oprávnění, která Google při propojení skutečně udělil (mezerou oddělená), nebo null bez propojení. */
export async function googleGrantedScopes(): Promise<string | null> {
  const stored = await loadStored()
  return stored?.scope ?? null
}

/** Přístupový token platí hodinu — v paměti procesu, ať se neobnovuje u každé schůzky. */
let accessCache: { token: string; expiresAt: number } | null = null

export class GoogleNotConnectedError extends Error {
  constructor(message = 'Google účet není propojený. Propojte ho v Profilu.') {
    super(message)
  }
}

export async function googleAccessToken(fetchImpl: Fetch = fetch): Promise<string> {
  if (accessCache && accessCache.expiresAt > Date.now()) return accessCache.token
  const stored = await loadStored()
  if (!stored) throw new GoogleNotConnectedError()
  const { clientId, clientSecret } = clientConfig()
  try {
    const tokens = await postToken(
      {
        refresh_token: decryptSecret(stored.refresh_token),
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      },
      fetchImpl,
    )
    accessCache = { token: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 }
    return tokens.access_token
  } catch (err) {
    // Odvolaný nebo prošlý token: propojení zahodit, ať admin ví, že má propojit znovu.
    if ((err as { googleError?: string }).googleError === 'invalid_grant') {
      await forgetGoogle()
      throw new GoogleNotConnectedError('Propojení s Googlem vypršelo. Propojte účet v Profilu znovu.')
    }
    throw err
  }
}

async function forgetGoogle(): Promise<void> {
  accessCache = null
  await adminDb`UPDATE admin_settings SET google_oauth = NULL, updated_at = now() WHERE id = true`
}

/** Odpojení: token se u Googlu odvolá (když to jde) a smaže se. */
export async function disconnectGoogle(fetchImpl: Fetch = fetch): Promise<void> {
  const stored = await loadStored()
  if (stored) {
    try {
      await fetchImpl(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: decryptSecret(stored.refresh_token) }).toString(),
        signal: AbortSignal.timeout(5000),
      })
    } catch (err) {
      // Odvolání je slušnost, ne podmínka: token se smaže tak jako tak.
      console.error('[google] Odvolání tokenu selhalo:', (err as Error).message)
    }
  }
  await forgetGoogle()
}

/** Jen pro testy. */
export function resetGoogleCacheForTests(): void {
  accessCache = null
}
