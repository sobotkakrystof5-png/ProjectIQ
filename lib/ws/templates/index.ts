import { autoservis } from './autoservis'
import { azbest } from './azbest'
import { kadernictviKosmetika } from './kadernictvi-kosmetika'
import { stavba } from './stavba'
import { studnarstvi } from './studnarstvi'
import type { IndustryKey, IndustryTemplate } from './types'
import { uklid } from './uklid'
import { vlastni } from './vlastni'
import { zamecnictvi } from './zamecnictvi'

export * from './types'
export { templateSeedQueries } from './seed'

/** Pořadí = pořadí v průvodci Nový byznys, „Jiný obor“ vždy poslední. */
export const INDUSTRY_TEMPLATES: readonly IndustryTemplate[] = [
  kadernictviKosmetika,
  zamecnictvi,
  studnarstvi,
  azbest,
  autoservis,
  uklid,
  stavba,
  vlastni,
]

export function getIndustryTemplate(key: string): IndustryTemplate {
  return INDUSTRY_TEMPLATES.find((t) => t.key === key) ?? vlastni
}

export const isIndustryKey = (key: string): key is IndustryKey => INDUSTRY_TEMPLATES.some((t) => t.key === key)
