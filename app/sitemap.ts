import type { MetadataRoute } from 'next'
import { LEGAL_PATHS, SITE_URL } from '@/components/marketing/seo'

/**
 * sitemap.xml (S05) — jen indexovatelné stránky: úvod a právní texty (R-079).
 * Bez lastModified: datum by muselo odpovídat skutečné změně obsahu, ne času buildu.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/` }, ...LEGAL_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }))]
}
