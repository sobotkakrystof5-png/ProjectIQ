import { ADMIN_SESSION_MAX_AGE_SECONDS } from './cookies'

/**
 * Tvrdý strop délky session **v kódu**, protože „Time-box user sessions"
 * v Supabase je placená funkce (Pro) a na našem plánu není (R-106).
 *
 * Bere `amr` z podepsaných claims — seznam metod, kterými se session
 * ověřila, s časem každé z nich. Na rozdíl od `iat` se `amr` **při obnovení
 * tokenu nemění**, takže nejstarší čas v něm je skutečný začátek session:
 * `[{ method: 'password', timestamp }]`, po druhém faktoru navíc
 * `{ method: 'totp', timestamp }`.
 *
 * Samotná cookie platí taky 12 h (`hardenedCookieOptions`), ale ta se při
 * každém obnovení prodlouží — je to klouzavé okno. Tohle je pevný strop od
 * přihlášení: po dvanácti hodinách se admin musí přihlásit znovu, i když
 * aplikaci používal nepřetržitě.
 *
 * Když `amr` chybí nebo nenese použitelný čas, strop se neuplatní a zůstává
 * jen cookie — nikdy se tím session neodmítne omylem.
 */
export function sessionStartedAt(claims: Record<string, unknown>): number | null {
  const amr = claims.amr
  if (!Array.isArray(amr)) return null

  const times: number[] = []
  for (const entry of amr) {
    if (!entry || typeof entry !== 'object') continue
    const ts = (entry as { timestamp?: unknown }).timestamp
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) times.push(ts)
  }
  return times.length > 0 ? Math.min(...times) : null
}

/** `true` = session je starší než strop a do adminu nepatří. */
export function sessionTooOld(claims: Record<string, unknown>, nowSeconds?: number): boolean {
  const startedAt = sessionStartedAt(claims)
  if (startedAt === null) return false

  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  return now - startedAt > ADMIN_SESSION_MAX_AGE_SECONDS
}
