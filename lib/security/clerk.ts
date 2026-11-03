/**
 * Odkud smí pocházet session token Clerku (claim `azp`). Clerk to pro produkci
 * doporučuje: token vydaný pro jinou (sub)doménu proxy odmítne.
 *
 * Jen v produkci Vercelu: Preview a dev mají vlastní adresy a Clerk tam běží
 * na dev instanci. Hlavní host je `https://www.zakaziq.cz` (R-075) z
 * `NEXT_PUBLIC_APP_URL`; apex přesměrovává na www, session na něm nevzniká.
 * Neplatná adresa = `undefined` (kontrola chybí jako dřív, přihlášení nespadne).
 * Stav: `.claude/security/STATE.md`.
 */
export function clerkAuthorizedParties(vercelEnv: string | undefined, appUrl: string | undefined): string[] | undefined {
  if (vercelEnv !== 'production' || !appUrl) return undefined
  let url: URL
  try {
    url = new URL(appUrl)
  } catch {
    // Neplatná NEXT_PUBLIC_APP_URL — bez seznamu, ať produkce nepřijde o přihlášení.
    return undefined
  }
  return url.protocol === 'https:' ? [url.origin] : undefined
}
