/**
 * Výpočet daně a odvodů OSVČ. Čistá matematika — žádné DB dotazy, žádný
 * React. Sazby si bere z `lib/tax-constants.ts`, jinde se nesmí počítat.
 *
 * Daňová evidence jede na hotovostním principu: do `income` patří jen to,
 * co reálně dorazilo (podle data zaplacení), ne vystavené faktury.
 */

import {
  EXPENSE_LUMP_SUM_RATE,
  EXPENSE_LUMP_SUM_CAP,
  INCOME_CAP_FOR_LUMP_SUM,
  TAX_RATE_BASE,
  TAX_RATE_UPPER,
  TAX_UPPER_BRACKET_THRESHOLD,
  TAXPAYER_CREDIT,
  SOCIAL_RATE,
  SOCIAL_ASSESSMENT_SHARE,
  SOCIAL_SECONDARY_THRESHOLD,
  HEALTH_RATE,
  HEALTH_ASSESSMENT_SHARE,
  TAX_YEAR,
} from './tax-constants'

/**
 * Podporovaný režim. Zatím jediný — vedlejší činnost studenta: bez
 * minimálních vyměřovacích základů, bez povinných záloh, sociální až po
 * překročení rozhodné částky.
 *
 * Hlavní činnost tu schválně není. Vyžadovala by minimální vyměřovací
 * základy, které v `tax-constants.ts` nejsou — a odhadnout je by znamenalo
 * vracet čísla, která vypadají přesně, ale nejsou.
 */
export type TaxRegime = 'secondary_student'

export interface TaxInput {
  /** Přiznaný příjem za rok podle data zaplacení (Kč) */
  income: number
  regime?: TaxRegime
  /** Rok příjmu. Sazby existují jen pro TAX_YEAR — u jiného roku se to pozná z `ratesMatchYear`. */
  year?: number
}

export interface TaxResult {
  income: number
  /** Uplatněný výdajový paušál (60 %, nejvýše 1,2 mil. Kč) */
  expenses: number
  /** Daňový základ = příjem − paušál */
  taxBase: number
  taxBeforeCredit: number
  /** Skutečně využitá sleva na poplatníka — nikdy víc, než kolik činí daň */
  creditUsed: number
  /** Daň po slevě */
  tax: number
  social: number
  health: number
  /** Daň po slevě + sociální + zdravotní */
  totalLevies: number
  /** Příjem − odvody */
  net: number
  /** Odvody / příjem, 0–1 */
  effectiveRate: number
  /** Kolik měsíčně odkládat, aby na odvody bylo */
  monthlyReserve: number
  /** Rok, ze kterého jsou sazby */
  ratesYear: number
  /** false = počítáno sazbami jiného roku, než za který je příjem */
  ratesMatchYear: boolean
  /** Příjem přesáhl 2 mil. Kč — paušál už nelze uplatnit a výsledek je jen orientační */
  overLumpSumCap: boolean
  /** Sociální pojištění se platí (daňový základ nad rozhodnou částkou) */
  socialApplies: boolean
}

/** Peníze na celé koruny — mezivýpočty zůstávají přesné, zaokrouhluje se až výstup. */
function czk(value: number): number {
  return Math.round(value)
}

export function calculateTax({ income, regime = 'secondary_student', year = TAX_YEAR }: TaxInput): TaxResult {
  // Záporný příjem nedává smysl a rozbil by všechny odvozené hodnoty.
  const P = Math.max(0, Number.isFinite(income) ? income : 0)

  const expenses = Math.min(EXPENSE_LUMP_SUM_RATE * P, EXPENSE_LUMP_SUM_CAP)
  const taxBase = P - expenses

  const taxBeforeCredit =
    TAX_RATE_BASE * Math.min(taxBase, TAX_UPPER_BRACKET_THRESHOLD) +
    TAX_RATE_UPPER * Math.max(0, taxBase - TAX_UPPER_BRACKET_THRESHOLD)
  const creditUsed = Math.min(taxBeforeCredit, TAXPAYER_CREDIT)
  const tax = taxBeforeCredit - creditUsed

  // Vedlejší činnost: do rozhodné částky se sociální neplatí vůbec.
  // Nad ní se platí z celého vyměřovacího základu, ne jen z přesahu —
  // proto je na hranici skok, který hlídač limitů ukazuje.
  const socialApplies = taxBase > SOCIAL_SECONDARY_THRESHOLD
  const social = socialApplies ? SOCIAL_RATE * (SOCIAL_ASSESSMENT_SHARE * taxBase) : 0

  // Student má plátcem zdravotního stát, takže neplatí minimální
  // vyměřovací základ ani zálohy — jen procento ze skutečného základu.
  const health = HEALTH_RATE * (HEALTH_ASSESSMENT_SHARE * taxBase)

  const taxCzk = czk(tax)
  const socialCzk = czk(social)
  const healthCzk = czk(health)
  const totalLevies = taxCzk + socialCzk + healthCzk

  return {
    income: czk(P),
    expenses: czk(expenses),
    taxBase: czk(taxBase),
    taxBeforeCredit: czk(taxBeforeCredit),
    creditUsed: czk(creditUsed),
    tax: taxCzk,
    social: socialCzk,
    health: healthCzk,
    totalLevies,
    net: czk(P) - totalLevies,
    effectiveRate: P > 0 ? totalLevies / P : 0,
    monthlyReserve: Math.ceil(totalLevies / 12),
    ratesYear: TAX_YEAR,
    ratesMatchYear: year === TAX_YEAR,
    overLumpSumCap: P > INCOME_CAP_FOR_LUMP_SUM,
    socialApplies,
  }
}

/** Nevyužitá část hranice. 0 znamená, že je hranice překročená. */
export function remainingToThreshold(income: number, threshold: number): number {
  return Math.max(0, threshold - Math.max(0, income))
}
