import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/components/marketing/seo'

/**
 * sitemap.xml (S05) — jen indexovatelné stránky. Právní stránky přibydou, až budou mít
 * skutečný text a zmizí jim noindex (LEGAL_ROBOTS). Bez lastModified: datum by muselo
 * odpovídat skutečné změně obsahu, ne času buildu.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/` }]
}
