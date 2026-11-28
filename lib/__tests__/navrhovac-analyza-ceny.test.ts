import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_RULES } from '@/lib/admin/offers/pricing'
import { applyProposalEdit, buildProposal } from '@/lib/admin/offers/proposal-model'
import { pricingAnalysis, type AnalysisSource } from '@/lib/admin/offers/pricing-analysis'

/**
 * Rozbor ceny jen pro Kryštofa (R-160). Čísla musí sedět s nabídkou: stejná
 * pravidla, stejné ceny, záloha a první rok se správou dopočítané z nich.
 */

const rules = DEFAULT_PRICING_RULES
/** Čísla v textu mají nedělitelnou mezeru mezi tisíci (`toLocaleString('cs-CZ')`). */
const flat = (lines: string[]) => lines.join(' ').replace(/\u00a0|\u202f/g, ' ')

function sourceFor(
  jobCzk: number | null,
  opts: { kind?: 'web' | 'eshop'; jobsPerMonth?: number | null; prices?: Partial<Record<'zaklad' | 'doporucena' | 'plus', number>> } = {},
): AnalysisSource {
  const draft = buildProposal(rules, null, 'Testovací firma')
  const edited = applyProposalEdit(rules, draft, {
    inputs: {
      kind: opts.kind ?? 'web',
      typicalJobCzk: jobCzk,
      jobsPerMonth: opts.jobsPerMonth ?? null,
      position: 'mid',
      rush: false,
      languages: 0,
      showPayback: false,
    },
    variants: draft.variants.map((v) => ({ key: v.key, price: opts.prices?.[v.key] ?? -1, includes: v.includes })),
    recommended: 'doporucena',
    intro: draft.intro,
  })
  // Cena -1 = „podle pravidel": editor by ji přepočítal tlačítkem, tady stačí převzít `proposed`.
  const variants = edited.variants.map((v) => (v.price === -1 ? { ...v, price: v.proposed } : v))
  return {
    kind: edited.kind,
    band: edited.band,
    rulesVersion: rules.version,
    inputs: edited.inputs,
    value: edited.value,
    variants,
    recommended: 'doporucena',
    managementMonthly: rules.managementMonthly,
    depositPercent: rules.depositPercent,
    internal: { positionReason: 'Zavedená firma od roku 2006.' },
  }
}

describe('rozbor ceny pro Kryštofa', () => {
  it('zakázka za 137 500 Kč: pásmo, záloha, první rok se správou a návratnost', () => {
    const a = pricingAnalysis(sourceFor(137_500), rules)
    const price = Object.fromEntries(a.variants.map((v) => [v.key, v.price]))
    expect(price).toEqual({ zaklad: 22_000, doporucena: 33_000, plus: 50_000 })

    const rec = a.variants.find((v) => v.key === 'doporucena')!
    expect(rec.deposit).toBe(9_900)
    expect(rec.rest).toBe(23_100)
    expect(rec.firstYear).toBe(33_000 + 12 * 999)
    expect(rec.paybackJobs).toBe(1)
    expect(rec.stepUp).toBe(11_000)
    expect(rec.range).toEqual({ min: 25_000, max: 40_000 })
    expect(rec.adds.some((s) => /poptávkový formulář/i.test(s))).toBe(true)
    expect(rec.adds.some((s) => /^Všechno z/i.test(s))).toBe(false)

    expect(flat(a.origin)).toContain('100 000–1 000 000 Kč')
    expect(flat(a.origin)).toContain('Zavedená firma od roku 2006.')
    expect(flat(a.combine)).toContain('44 988 Kč')
    expect(flat(a.combine)).toContain('9 900 Kč předem')
    expect(flat(a.combine)).toContain('z jedné zakázky')
    expect(flat(a.negotiate)).toContain('Základ za 22 000 Kč')
    expect(flat([a.negotiate[0]])).toMatch(/ubírejte rozsah, ne cenu/)
  })

  it('pásmo podle přínosu za měsíc (R-157): zámečník, 10 zakázek po 4 000 Kč', () => {
    const a = pricingAnalysis(sourceFor(4_000, { jobsPerMonth: 10 }), rules)
    expect(a.variants.find((v) => v.key === 'doporucena')!.price).toBe(22_000)
    expect(flat(a.origin)).toContain('přinese odhadem 10 zakázek měsíčně (zadali jste ho vy), tedy 40 000 Kč měsíčně')
    expect(flat(a.origin)).toContain('podle přínosu za měsíc: přínos 20 000–100 000 Kč měsíčně')
    expect(flat(a.combine)).toContain('Při 10 zakázkách měsíčně pokryjí tržby z webu cenu Doporučené za 1 měsíc')
    expect(flat(a.check)).not.toMatch(/kolik zakázek měsíčně/)
  })

  it('bez počtu zakázek vybere pásmo podle ceny zakázky a radí zeptat se na počet', () => {
    const a = pricingAnalysis(sourceFor(4_000), rules)
    expect(flat(a.origin)).toContain('podle ceny jedné zakázky (počet zakázek chybí): zakázka pod 10 000 Kč')
    expect(flat(a.origin)).not.toMatch(/tedy .* Kč měsíčně/)
    expect(flat(a.check)).toMatch(/kolik zakázek měsíčně by jim web měl přinést/)
  })

  it('jedna zakázka měsíčně se skloňuje', () => {
    const a = pricingAnalysis(sourceFor(50_000, { jobsPerMonth: 1 }), rules)
    expect(flat(a.origin)).toContain('přinese odhadem 1 zakázku měsíčně')
    expect(flat(a.combine)).toMatch(/Při 1 zakázce měsíčně/)
  })

  it('bez ceny zakázky radí zeptat se klienta a pásmo označí jako předpokládané', () => {
    const a = pricingAnalysis(sourceFor(null), rules)
    expect(flat([a.origin[0]])).toMatch(/neznáme/)
    expect(flat(a.origin)).toContain('(předpokládané)')
    expect(flat([a.check[0]])).toMatch(/Zeptejte se, kolik stojí jedna jejich zakázka/)
  })

  it('ručně změněná cena ukáže odchylku od pravidel', () => {
    const a = pricingAnalysis(sourceFor(137_500, { prices: { doporucena: 40_000 } }), rules)
    expect(flat(a.combine)).toMatch(/Doporučená máte \+21 % proti pravidlům/)
  })

  it('cena nad stropem se musí potvrdit', () => {
    const a = pricingAnalysis(sourceFor(137_500, { prices: { plus: 60_000 } }), rules)
    expect(a.variants.find((v) => v.key === 'plus')!.needsConfirmation).toBe(true)
    expect(flat(a.check)).toMatch(/Plus je nad 50 000 Kč/)
  })

  it('e-shop bere ceny z rozmezí pro e-shopy', () => {
    const a = pricingAnalysis(sourceFor(null, { kind: 'eshop' }), rules)
    expect(flat([a.origin[0]])).toMatch(/^E-shop/)
    expect(a.variants.find((v) => v.key === 'zaklad')!.range).toEqual(rules.eshop.zaklad)
  })

  it('jiná verze pravidel se přizná', () => {
    const a = pricingAnalysis({ ...sourceFor(137_500), rulesVersion: 1 }, { ...rules, version: 3 })
    expect(flat(a.origin)).toContain('verze 1, teď platí verze 3')
  })
})
