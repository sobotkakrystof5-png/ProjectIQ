/**
 * Odkud smí admin stahovat obrázky ukázek (R-120). Ukázky staví Growth OS
 * a hostuje je Cloudflare Pages na `navrhy.vizeon.cz` (README autopilota).
 * Jiná adresa, i když přijde ve snímku, se nestáhne.
 */
export const DEMO_ASSET_HOSTS = ['navrhy.vizeon.cz'] as const

export function isAllowedDemoAsset(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    (DEMO_ASSET_HOSTS as readonly string[]).includes(url.hostname)
  )
}

/**
 * Odkaz na ukázku z adminu (R-120): přidá `od=admin`, ať Growth OS otevření
 * Kryštofem nepočítá jako zájem klienta. Do e-mailu klientovi se nepoužívá.
 */
export function adminDemoHref(raw: string): string {
  try {
    const url = new URL(raw)
    url.searchParams.set('od', 'admin')
    return url.toString()
  } catch {
    return raw
  }
}
