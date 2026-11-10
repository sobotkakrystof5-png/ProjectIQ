// Kam smí vést přesměrování po přihlášení, potvrzení e-mailu nebo obnově hesla
// (parametr `next`). Jen relativní cesty do naší aplikace — nikdy jiný web
// (open redirect), nikdy `//host`, `\` ani schéma.

const ALLOWED_PREFIXES = ['/w', '/klient', '/dashboard', '/alteno', '/hub'] as const

export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw || raw.length > 512) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return fallback
  let url: URL
  try {
    url = new URL(raw, 'https://zakaziq.invalid')
  } catch {
    return fallback
  }
  if (url.origin !== 'https://zakaziq.invalid') return fallback
  const path = url.pathname
  const allowed = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
  return allowed ? `${path}${url.search}` : fallback
}
