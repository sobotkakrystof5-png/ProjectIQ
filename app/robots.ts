import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/components/marketing/seo'

/**
 * robots.txt (S05). Indexovat se má jen landing page. Neveřejné části (aplikace, admin,
 * objednávací stránky, portály) mají noindex v hlavičce X-Robots-Tag (next.config.mjs).
 * Zakázat je i tady by bylo proti tomu: robot by stránku nestáhl, noindex by neviděl
 * a adresa z cizího odkazu by se mohla dostat do výsledků bez obsahu. Zakázané je jen API.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
