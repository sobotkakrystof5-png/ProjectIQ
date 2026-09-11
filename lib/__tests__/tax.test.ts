import { describe, it, expect } from 'vitest'
import { calculateTax, remainingToThreshold } from '../tax'
import {
  INCOME_THRESHOLD_SOCIAL,
  INCOME_THRESHOLD_TAX,
  INCOME_CAP_FOR_LUMP_SUM,
  EXPENSE_LUMP_SUM_CAP,
  TAX_UPPER_BRACKET_THRESHOLD,
  TAXPAYER_CREDIT,
  TAX_YEAR,
} from '../tax-constants'

describe('calculateTax — nulový a záporný příjem', () => {
  it('vrátí samé nuly pro nulový příjem', () => {
    const r = calculateTax({ income: 0 })
    expect(r.taxBase).toBe(0)
    expect(r.tax).toBe(0)
    expect(r.social).toBe(0)
    expect(r.health).toBe(0)
    expect(r.totalLevies).toBe(0)
    expect(r.net).toBe(0)
    // Bez dělení nulou — efektivní zdanění je definované jako 0, ne NaN
    expect(r.effectiveRate).toBe(0)
  })

  it('záporný příjem ořízne na nulu místo záporných odvodů', () => {
    const r = calculateTax({ income: -50_000 })
    expect(r.income).toBe(0)
    expect(r.totalLevies).toBe(0)
  })
})

describe('calculateTax — hranice sociálního pojištění', () => {
  it('těsně pod hranicí sociální neplatí', () => {
    const r = calculateTax({ income: INCOME_THRESHOLD_SOCIAL })
    expect(r.socialApplies).toBe(false)
    expect(r.social).toBe(0)
  })

  it('těsně nad hranicí sociální vzniká', () => {
    const r = calculateTax({ income: INCOME_THRESHOLD_SOCIAL + 1 })
    expect(r.socialApplies).toBe(true)
    expect(r.social).toBeGreaterThan(0)
  })

  it('hranice je skok, ne postupný náběh — platí se z celého základu', () => {
    const under = calculateTax({ income: INCOME_THRESHOLD_SOCIAL })
    const over = calculateTax({ income: INCOME_THRESHOLD_SOCIAL + 1 })
    // O jednu korunu příjmu navíc přibude přes 18 000 Kč sociálního
    expect(over.social - under.social).toBeGreaterThan(18_000)
  })
})

describe('calculateTax — hranice daně z příjmu', () => {
  it('na hranici slevy je daň po slevě nulová', () => {
    const r = calculateTax({ income: INCOME_THRESHOLD_TAX })
    expect(r.taxBeforeCredit).toBe(TAXPAYER_CREDIT)
    expect(r.creditUsed).toBe(TAXPAYER_CREDIT)
    expect(r.tax).toBe(0)
  })

  it('pod hranicí sleva nepokrytou daň nepřeklopí do záporu', () => {
    const r = calculateTax({ income: 200_000 })
    expect(r.tax).toBe(0)
    expect(r.creditUsed).toBe(r.taxBeforeCredit)
  })

  it('nad hranicí se daň reálně platí', () => {
    const r = calculateTax({ income: 600_000 })
    // ZD = 240 000 → daň 36 000 − sleva 30 840 = 5 160
    expect(r.taxBase).toBe(240_000)
    expect(r.taxBeforeCredit).toBe(36_000)
    expect(r.tax).toBe(5_160)
  })
})

describe('calculateTax — druhé daňové pásmo', () => {
  it('do hranice pásma počítá jen 15 %', () => {
    // ZD přesně na hranici druhého pásma
    const income = (TAX_UPPER_BRACKET_THRESHOLD + EXPENSE_LUMP_SUM_CAP)
    const r = calculateTax({ income })
    expect(r.taxBase).toBe(TAX_UPPER_BRACKET_THRESHOLD)
    expect(r.taxBeforeCredit).toBe(Math.round(0.15 * TAX_UPPER_BRACKET_THRESHOLD))
  })

  it('nad hranicí zdaní přesah 23 %', () => {
    const r = calculateTax({ income: 3_000_000 })
    // Paušál na stropu 1,2 mil. → ZD = 1 800 000
    expect(r.taxBase).toBe(1_800_000)
    const expected =
      0.15 * TAX_UPPER_BRACKET_THRESHOLD + 0.23 * (1_800_000 - TAX_UPPER_BRACKET_THRESHOLD)
    expect(r.taxBeforeCredit).toBe(Math.round(expected))
    expect(r.tax).toBe(Math.round(expected - TAXPAYER_CREDIT))
  })
})

describe('calculateTax — strop paušálu', () => {
  it('pod stropem uplatní celých 60 %', () => {
    const r = calculateTax({ income: 1_000_000 })
    expect(r.expenses).toBe(600_000)
    expect(r.overLumpSumCap).toBe(false)
  })

  it('nad 2 mil. Kč paušál zastropuje a označí výsledek za orientační', () => {
    const r = calculateTax({ income: 2_500_000 })
    expect(r.expenses).toBe(EXPENSE_LUMP_SUM_CAP)
    expect(r.overLumpSumCap).toBe(true)
  })

  it('přesně na 2 mil. Kč ještě není překročeno', () => {
    const r = calculateTax({ income: INCOME_CAP_FOR_LUMP_SUM })
    expect(r.expenses).toBe(EXPENSE_LUMP_SUM_CAP)
    expect(r.overLumpSumCap).toBe(false)
  })
})

describe('calculateTax — papírový příklad 300 000 Kč', () => {
  const r = calculateTax({ income: 300_000 })

  it('daňový základ je 40 % příjmu', () => {
    expect(r.expenses).toBe(180_000)
    expect(r.taxBase).toBe(120_000)
  })

  it('sleva pokryje celou daň', () => {
    expect(r.taxBeforeCredit).toBe(18_000)
    expect(r.tax).toBe(0)
  })

  it('sociální 29,2 % z 55 % základu', () => {
    expect(r.social).toBe(19_272)
  })

  it('zdravotní 13,5 % z 50 % základu', () => {
    expect(r.health).toBe(8_100)
  })

  it('odvody, čistý zisk a rezerva sedí na součet', () => {
    expect(r.totalLevies).toBe(27_372)
    expect(r.net).toBe(272_628)
    expect(r.monthlyReserve).toBe(2_281)
    expect(r.effectiveRate).toBeCloseTo(0.0912, 4)
  })
})

describe('calculateTax — konzistence výstupu', () => {
  it('čistý zisk je vždy příjem minus odvody', () => {
    for (const income of [0, 100_000, 293_803, 514_001, 1_500_000, 3_000_000]) {
      const r = calculateTax({ income })
      expect(r.net).toBe(r.income - r.totalLevies)
      expect(r.totalLevies).toBe(r.tax + r.social + r.health)
    }
  })

  it('označí, když příjem patří do jiného roku, než ze kterého jsou sazby', () => {
    expect(calculateTax({ income: 300_000, year: TAX_YEAR }).ratesMatchYear).toBe(true)
    expect(calculateTax({ income: 300_000, year: TAX_YEAR - 1 }).ratesMatchYear).toBe(false)
    expect(calculateTax({ income: 300_000, year: TAX_YEAR - 1 }).ratesYear).toBe(TAX_YEAR)
  })
})

describe('remainingToThreshold', () => {
  it('spočítá, kolik do hranice zbývá', () => {
    expect(remainingToThreshold(100_000, 293_802)).toBe(193_802)
  })

  it('po překročení vrací nulu, ne záporné číslo', () => {
    expect(remainingToThreshold(400_000, 293_802)).toBe(0)
  })
})
