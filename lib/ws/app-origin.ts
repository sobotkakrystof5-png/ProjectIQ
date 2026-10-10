import 'server-only'
import { headers } from 'next/headers'
import { orderPagePath } from './paths'

/**
 * Adresa aplikace pro odkazy, které uživatel posílá ven (objednávací stránka).
 * Hlavně z NEXT_PUBLIC_APP_URL; bez ní (lokální vývoj) z hlavičky požadavku.
 */
export function appOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/+$/, '')
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export const orderPageUrl = (slug: string): string => `${appOrigin()}${orderPagePath(slug)}`

/** Klientský portál (S16): odkaz pro zákazníka na termín nebo zakázku. */
export const portalPageUrl = (publicToken: string): string => `${appOrigin()}/z/${publicToken}`
