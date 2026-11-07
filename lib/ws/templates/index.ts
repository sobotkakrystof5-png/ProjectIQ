import { autoservis } from './autoservis'
import { azbest } from './azbest'
import { fitnessLekce } from './fitness-lekce'
import { kadernictviKosmetika } from './kadernictvi-kosmetika'
import { kavarnaRestaurace } from './kavarna-restaurace'
import { ordinacePece } from './ordinace-pece'
import { stavba } from './stavba'
import { studnarstvi } from './studnarstvi'
import type { IndustryKey, IndustryTemplate } from './types'
import { ucetniPoradci } from './ucetni-poradci'
import { uklid } from './uklid'
import { vlastni } from './vlastni'
import { zamecnictvi } from './zamecnictvi'

export * from './types'
export { templateSeedQueries } from './seed'

/**
 * Pořadí = pořadí v průvodci Nový byznys: nejdřív obory, kam se chodí na termín
 * (stejně jako sekce Pro koho na landing page, R-081), pak řemesla, „Jiný obor“ vždy poslední.
 */
export const INDUSTRY_TEMPLATES: readonly IndustryTemplate[] = [
  kadernictviKosmetika,
  kavarnaRestaurace,
  fitnessLekce,
  ucetniPoradci,
  ordinacePece,
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
