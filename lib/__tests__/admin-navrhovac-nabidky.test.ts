import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Navrhovač nabídek, kroky N2–N4 (R-147, R-155): cenová pravidla, odhad
 * hodnoty, tři varianty, stránka nabídky, výsledek nabídky, měsíční
 * vyhodnocení a odhad proti skutečným poptávkám — proti skutečnému
 * Postgresu s migracemi 136, 137 a 142. Nic se neposílá ven.
 */

const ROOT = path.resolve(__dirname, '../..')
let db: PGlite

const notifications = vi.hoisted(() => [] as { type: string; title: string; link?: string; body?: string }[])

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ sql: async () => [] }))
vi.mock('@/lib/api-rate-limit', () => ({ isApiRateLimited: async () => false, recordApiRequest: async () => {} }))
vi.mock('@/lib/notifications', () => ({
  createNotification: async (n: { type: string; title: string; link?: string; body?: string }) => {
    notifications.push(n)
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import {
  DEFAULT_PRICING_RULES,
  applyRuleChange,
  bandIndexFor,
  bandLabel,
  paybackJobs,
  paybackSentence,
  priceVariants,
  pricingRulesSchema,
  readPricingRules,
  type PricingRules,
} from '@/lib/admin/offers/pricing'
import { normalizeResult, readStoredResult, stripLinks } from '@/lib/admin/offers/result'
import {
  DEFAULT_INTRO,
  applyProposalEdit,
  buildProposal,
  clientOffer,
  offerEmailLines,
  type ProposalVariant,
} from '@/lib/admin/offers/proposal-model'
import { compareActual, evaluateOffers, previousPeriod, shareBucket, slug, suggestRuleChanges, type ReviewRow } from '@/lib/admin/offers/review'
import { pickSimilar, type SimilarCandidate } from '@/lib/admin/offers/similar'
import { submitResult } from '@/lib/admin/offers/research'
import {
  acceptSuggestion,
  chooseVariant,
  createSuggestions,
  getProposal,
  listProposalsForContact,
  listSimilarOffers,
  loadPricingRules,
  loadPublicOffer,
  maintainOfferProposals,
  markOpened,
  publishProposal,
  purgeOfferProposals,
  runMonthlyOfferReview,
  savePricingRules,
  setOutcome,
  undoSuggestion,
  updateProposal,
  loadOfferReview,
} from '@/lib/admin/offers/proposals'
import { buildOfferBody } from '@/lib/admin/lead-mail-templates'
import { pgliteAdminDriver } from './helpers/admin-pglite'

const R = DEFAULT_PRICING_RULES

/* ------------------------------------------------------------------ */
/* Cenová pravidla                                                     */
/* ------------------------------------------------------------------ */

describe('cenová pravidla: pásmo podle ceny jedné zakázky klienta', () => {
  it('vybere pásmo, neznámá cena = druhé pásmo s příznakem', () => {
    expect(bandIndexFor(R, 5_000)).toEqual({ band: 0, assumed: false })
    expect(bandIndexFor(R, 10_000)).toEqual({ band: 1, assumed: false })
    expect(bandIndexFor(R, 99_999)).toEqual({ band: 1, assumed: false })
    expect(bandIndexFor(R, 100_000)).toEqual({ band: 2, assumed: false })
    expect(bandIndexFor(R, 6_000_000)).toEqual({ band: 3, assumed: false })
    expect(bandIndexFor(R, null)).toEqual({ band: 1, assumed: true })
    expect(bandLabel(R, 0)).toBe(`pod ${(10_000).toLocaleString('cs-CZ')} Kč`)
    expect(bandLabel(R, 3)).toBe(`nad ${(1_000_000).toLocaleString('cs-CZ')} Kč`)
  })

  it('střed třetiny pásma, celé tisíce, Základ < Doporučená < Plus', () => {
    const web = (typicalJobCzk: number, position: 'low' | 'mid' | 'high') =>
      priceVariants(R, { kind: 'web', typicalJobCzk, position, rush: false, languages: 0 }).prices
    expect(web(50_000, 'mid')).toEqual({ zaklad: 15_000, doporucena: 22_000, plus: 35_000 })
    expect(web(50_000, 'low')).toEqual({ zaklad: 13_000, doporucena: 19_000, plus: 32_000 })
    expect(web(50_000, 'high')).toEqual({ zaklad: 17_000, doporucena: 24_000, plus: 38_000 })
    expect(web(5_000, 'low')).toEqual({ zaklad: 10_000, doporucena: 13_000, plus: 19_000 })
  })

  it('překrývající se rozmezí pořadí nerozbijí a web nejde pod spodní hranici', () => {
    const rules: PricingRules = structuredClone(R)
    rules.bands[1].ranges = { zaklad: { min: 5_000, max: 5_000 }, doporucena: { min: 5_000, max: 5_000 }, plus: { min: 5_000, max: 5_000 } }
    const out = priceVariants(rules, { kind: 'web', typicalJobCzk: 50_000, position: 'mid', rush: false, languages: 0 })
    expect(out.prices).toEqual({ zaklad: 10_000, doporucena: 11_000, plus: 12_000 })
  })

  it('příplatky ke všem variantám, nad stropem chce potvrzení; e-shop mimo pásma', () => {
    const out = priceVariants(R, { kind: 'web', typicalJobCzk: 50_000, position: 'mid', rush: true, languages: 1 })
    expect(out.prices).toEqual({ zaklad: 23_000, doporucena: 34_000, plus: 54_000 })
    expect(out.needsConfirmation).toEqual({ zaklad: false, doporucena: false, plus: true })
    const eshop = priceVariants(R, { kind: 'eshop', typicalJobCzk: 2_000, position: 'mid', rush: false, languages: 0 })
    expect(eshop.band).toBeNull()
    expect(eshop.prices).toEqual({ zaklad: 35_000, doporucena: 45_000, plus: 65_000 })
  })

  it('věta o návratnosti jen do tří zakázek a jen se známou cenou zakázky', () => {
    expect(paybackSentence(paybackJobs(22_000, 60_000))).toBe('Web se vám zaplatí z jedné zakázky.')
    expect(paybackSentence(paybackJobs(22_000, 8_000))).toBe('Web se vám zaplatí ze tří zakázek.')
    expect(paybackSentence(paybackJobs(22_000, 15_000))).toBe('Web se vám zaplatí ze dvou zakázek.')
    expect(paybackSentence(paybackJobs(22_000, 4_000))).toBeNull()
    expect(paybackSentence(paybackJobs(22_000, null))).toBeNull()
  })

  it('úprava pravidel z návrhu zvedne verzi; neplatná pravidla = výchozí', () => {
    const raised = applyRuleChange(R, { type: 'raise_band', band: 1, percent: 10 })
    expect(raised?.version).toBe(R.version + 1)
    expect(raised?.bands[1].ranges.zaklad).toEqual({ min: 13_000, max: 20_000 })
    const shifted = applyRuleChange(R, { type: 'shift_variant', band: 'eshop', variant: 'plus', delta: 5_000 })
    expect(shifted?.eshop.plus).toEqual({ min: 55_000, max: 85_000 })
    expect(applyRuleChange(R, { type: 'raise_band', band: 9, percent: 10 })).toBeNull()
    expect(readPricingRules({ version: 'x' })).toBe(DEFAULT_PRICING_RULES)
    const bad = structuredClone(R)
    bad.bands[0].ranges.zaklad = { min: 20_000, max: 10_000 }
    expect(pricingRulesSchema.safeParse(bad).success).toBe(false)
    expect(pricingRulesSchema.safeParse(R).success).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* Výsledek rozboru verze 2                                            */
/* ------------------------------------------------------------------ */

function researchInput(extra: Record<string, unknown> = {}) {
  return {
    sources: [
      { url: 'https://studny-novak.cz/', title: 'Web firmy' },
      { url: 'https://ares.gov.cz/firma/12345678', title: 'ARES' },
    ],
    web: { url: 'https://studny-novak.cz', exists: true, state: 'outdated', tech: 'Webnode', findings: [], gaps: [] },
    company: {
      summary: 'Rodinná firma, která vrtá studny na Kroměřížsku.',
      industry: 'Studny',
      city: 'Kroměříž',
      ico: null,
      legal_form: 's.r.o.',
      founded_year: 2008,
      findings: [{ text: 'Obrat 20 milionů.', sources: [1] }],
    },
    reviews: { count: null, rating: null, sources: [], praised: [], criticized: [] },
    typical_job: { min_czk: 60_000, max_czk: 180_000, confidence: 'medium', reasoning: 'Z ceníku.', sources: [0] },
    competitors: [],
    signals: [],
    warnings: [],
    ask_client: ['Kolik vrtů ročně uděláte?'],
    value: {
      inquiries_per_month_min: 6,
      inquiries_per_month_max: 3,
      win_rate: 0.3,
      current_loss: 'Lidé hledající vrt v okolí najdou konkurenci s ceníkem.',
      assumptions: ['V okolí hledá vrt studny měsíčně kolem 100 lidí.'],
      confidence: 'high',
      sources: [],
    },
    offer: {
      kind: 'web',
      position: 'high',
      position_reason: 'Tři vrtné soupravy a obrat přes 20 milionů.',
      plus_system: 'rezervace',
      extras: {
        zaklad: [],
        doporucena: ['Stránka pro vrtání studní, čištění a revize', 'Kalkulačka ceny vrtu viz https://zle.cz', 'X', 'Y'],
        plus: [],
      },
      client_intro:
        'Nový web vám bude nosit poptávky od lidí z okolí, kteří hledají vrt studny. Napište mi na info@zle.cz nebo navštivte www.zle.cz.',
    },
    ...extra,
  }
}

describe('výsledek rozboru verze 2: odhad hodnoty a podklad pro varianty', () => {
  it('srovná rozmezí poptávek, zastropí jistotu jistotou ceny zakázky, ořízne odkazy z textů pro klienta', () => {
    const out = normalizeResult(researchInput())
    if (!out.ok) throw new Error('mělo projít')
    const r = out.result
    expect(r.v).toBe(2)
    expect(r.value?.inquiries).toEqual({ min: 3, max: 6 })
    expect(r.value?.win_rate).toBe(0.3)
    expect(r.value?.confidence).toBe('medium')
    expect(r.offer?.extras.doporucena).toHaveLength(3)
    expect(r.offer?.extras.doporucena[1]).not.toContain('http')
    expect(r.offer?.client_intro).not.toMatch(/@|www\.|https?:/)
  })

  it('bez odhadu a podkladu projde jako dřív; uložená verze 1 dostane prázdný odhad', () => {
    const out = normalizeResult(researchInput({ value: 'nesmysl', offer: undefined }))
    if (!out.ok) throw new Error('mělo projít')
    expect(out.result.value).toBeNull()
    expect(out.result.offer).toBeNull()
    const v1 = readStoredResult({ ...out.result, v: 1, value: undefined, offer: undefined })
    expect(v1?.value).toBeNull()
    expect(stripLinks('Viz https://a.cz/x a www.b.cz, pište na a@b.cz <b>')).toBe('Viz a pište na b')
  })
})

/* ------------------------------------------------------------------ */
/* Model nabídky                                                       */
/* ------------------------------------------------------------------ */

describe('návrh nabídky z rozboru', () => {
  const result = (() => {
    const out = normalizeResult(researchInput())
    if (!out.ok) throw new Error('mělo projít')
    return out.result
  })()

  it('tři varianty podle pravidel, systém navíc a položky šité na firmu', () => {
    const draft = buildProposal(R, result, 'Studny Novák')
    // 60–180 tisíc = střed 120 000 → třetí pásmo, horní třetina.
    expect(draft.band).toBe(2)
    expect(draft.variants.map((v) => v.price)).toEqual([24_000, 38_000, 53_000])
    expect(draft.variants.map((v) => v.proposed)).toEqual([24_000, 38_000, 53_000])
    expect(draft.variants[2].needsConfirmation).toBe(true)
    expect(draft.variants[1].includes[0]).toBe('Všechno ze Základu')
    expect(draft.variants[1].includes[1]).toBe('Stránka pro vrtání studní, čištění a revize')
    expect(draft.variants[2].includes).toContain('Online rezervace termínů, které vám chodí rovnou do kalendáře')
    expect(draft.value.yearly).toEqual({ min: 648_000, max: 3_888_000 })
    expect(draft.inputs.showPayback).toBe(true)
    expect(draft.internal.positionReason).toContain('obrat')
  })

  it('bez rozboru: druhé pásmo, výchozí úvod, žádná věta o návratnosti', () => {
    const draft = buildProposal(R, null, 'Firma')
    expect(draft.inputs.assumedBand).toBe(true)
    expect(draft.intro).toBe(DEFAULT_INTRO)
    expect(draft.inputs.showPayback).toBe(false)
  })

  it('klient nevidí odhad, obor ani zdůvodnění pozice', () => {
    const draft = buildProposal(R, result, 'Studny Novák')
    const view = clientOffer({
      ...draft,
      management_monthly: draft.managementMonthly,
      deposit_percent: draft.depositPercent,
      sent_at: null,
      valid_until: null,
      chosen_variant: null,
      chosen_management: null,
      chosen_at: null,
      project_id: null,
    })
    const text = JSON.stringify(view)
    expect(text).not.toContain('obrat')
    expect(text).not.toContain('proposed')
    expect(text).not.toContain('Studny"')
    expect(view.payback).toBe('Web se vám zaplatí z jedné zakázky.')
  })

  it('úprava: cena zakázky z hovoru přepočítá „podle pravidel", ruční cena zůstane', () => {
    const draft = buildProposal(R, result, 'Studny Novák')
    const next = applyProposalEdit(R, draft, {
      inputs: { kind: 'web', typicalJobCzk: 8_000, position: 'mid', rush: false, languages: 0, showPayback: true },
      variants: draft.variants.map((v) => ({ key: v.key, price: v.key === 'doporucena' ? 16_000 : v.price, includes: v.includes })),
      recommended: 'doporucena',
      intro: ' Úvod ',
    })
    expect(next.inputs.jobSource).toBe('manual')
    expect(next.band).toBe(0)
    expect(next.variants[1]).toMatchObject({ price: 16_000, proposed: 14_000 })
    expect(next.value.typicalJob).toEqual({ min: 8_000, max: 8_000 })
    expect(next.intro).toBe('Úvod')
  })

  it('e-mail Nabídka s odkazem na stránku nabídky, odkaz na konci řádku bez tečky', () => {
    const body = buildOfferBody('22 000 Kč', 'https://www.zakaziq.cz/nabidka/abc')
    expect(body).toContain('Doporučuji variantu za 22 000 Kč.')
    expect(body).toMatch(/najdete tady: https:\/\/www\.zakaziq\.cz\/nabidka\/abc\n/)
    expect(offerEmailLines('', 'https://x')).toHaveLength(3)
  })
})

/* ------------------------------------------------------------------ */
/* Vyhodnocení (čisté funkce)                                          */
/* ------------------------------------------------------------------ */

const variant = (key: 'zaklad' | 'doporucena' | 'plus', price: number, proposed: number): ProposalVariant => ({
  key,
  name: key,
  includes: [],
  price,
  proposed,
  needsConfirmation: false,
})

function reviewRow(over: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: crypto.randomUUID(),
    company: 'Firma',
    contact_id: crypto.randomUUID(),
    status: 'accepted',
    sent_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    kind: 'web',
    band: 1,
    industry: 'Studny',
    reference_price: false,
    recommended: 'doporucena',
    sent_variants: [variant('zaklad', 15_000, 15_000), variant('doporucena', 26_000, 22_000), variant('plus', 35_000, 35_000)],
    opened_at: new Date().toISOString(),
    project_id: null,
    final_price_czk: null,
    inquiries: null,
    yearly: null,
    web: null,
    ...over,
  }
}

describe('vyhodnocení nabídek a návrhy pravidel', () => {
  it('úspěšnost, cena podle pravidel ±10 % a referenční ceny stranou', () => {
    const rows = [
      reviewRow(),
      reviewRow({ status: 'declined', sent_variants: [variant('zaklad', 15_000, 15_000), variant('doporucena', 22_000, 22_000), variant('plus', 35_000, 35_000)] }),
      reviewRow({ status: 'sent' }),
      reviewRow({ reference_price: true }),
      reviewRow({ sent_at: new Date(Date.now() - 200 * 86_400_000).toISOString() }),
    ]
    const review = evaluateOffers(rows, R)
    expect(review).toMatchObject({ sent: 3, accepted: 1, declined: 1, pending: 1, resolved: 2, references: 1 })
    expect(review.successRate).toBe(0.5)
    expect(review.withinTen).toEqual({ hit: 1, total: 3 })
  })

  it('nad 60 % zvednout pásmo, opakovaná odchylka posune variantu, otisk drží verzi', () => {
    const rows = Array.from({ length: 5 }, () => reviewRow())
    const s = suggestRuleChanges(evaluateOffers(rows, R), R, '2026-11')
    expect(s.map((x) => x.fingerprint)).toEqual(['raise:v1:b1', 'shift:v1:b1:doporucena:up'])
    expect(s[1].payload).toEqual({ type: 'shift_variant', band: 1, variant: 'doporucena', delta: 4_000 })
  })

  it('pod 20 % hledá, kde to vázne, a cenu nesnižuje', () => {
    const rows = Array.from({ length: 6 }, () => reviewRow({ status: 'no_reply', opened_at: null, sent_variants: null }))
    const s = suggestRuleChanges(evaluateOffers(rows, R), R, '2026-11')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ kind: 'insight', fingerprint: 'insight:low:2026-11' })
    expect(s[0].reason).toContain('otevřelo ji 0 z 6')
  })

  it('N4: skutečné poptávky z webu proti odhadu, obor opakovaně pod odhadem', () => {
    const start = new Date(Date.now() - 7 * 30.44 * 86_400_000).toISOString()
    const a = compareActual(reviewRow({ inquiries: { min: 3, max: 6 }, web: { start, n6: 12, n12: 12 } }), new Date())
    expect(a).toMatchObject({ months: 6, count: 12, perMonth: 2, verdict: 'under' })
    expect(compareActual(reviewRow({ inquiries: { min: 3, max: 6 }, web: { start: new Date().toISOString(), n6: 0, n12: 0 } }), new Date())).toBeNull()
    const rows = Array.from({ length: 3 }, () => reviewRow({ industry: 'Studny', inquiries: { min: 3, max: 6 }, web: { start, n6: 6, n12: 6 } }))
    const s = suggestRuleChanges(evaluateOffers(rows, R), R, '2026-11')
    expect(s.some((x) => x.fingerprint === 'insight:n4:studny:under:2026-11')).toBe(true)
    expect(slug('Výroba nábytku')).toBe('vyroba-nabytku')
  })

  it('podíl ceny z hodnoty: doporučená cena proti středu ročního přínosu', () => {
    expect([0.05, 0.1, 0.24, 0.25, 0.49, 0.5, 2].map(shareBucket)).toEqual(['under10', 'to25', 'to25', 'to50', 'to50', 'over50', 'over50'])
    const rows = [
      // 26 000 z 200 000 = 13 %
      reviewRow({ yearly: { min: 150_000, max: 250_000 } }),
      reviewRow({ status: 'declined', yearly: { min: 150_000, max: 250_000 } }),
      // 26 000 ze 40 000 = 65 %
      reviewRow({ status: 'no_reply', yearly: { min: 40_000, max: 40_000 } }),
      // bez odhadu přínosu a referenční cena se nepočítají
      reviewRow(),
      reviewRow({ reference_price: true, yearly: { min: 40_000, max: 40_000 } }),
    ]
    const review = evaluateOffers(rows, R)
    expect(review.shares).toEqual([
      { bucket: 'to25', label: '10–25 % ročního přínosu', sent: 2, resolved: 2, accepted: 1, rate: 0.5 },
      { bucket: 'over50', label: '50 % ročního přínosu a víc', sent: 1, resolved: 1, accepted: 0, rate: 0 },
    ])
  })

  it('podobné nabídky: obor nebo pásmo, bez téhož kontaktu, referenčních cen a konceptů', () => {
    const own = crypto.randomUUID()
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
    const base = (over: Partial<SimilarCandidate>): SimilarCandidate => ({
      id: crypto.randomUUID(),
      contact_id: crypto.randomUUID(),
      company: 'Firma',
      industry: 'Studny',
      kind: 'web',
      band: 1,
      status: 'accepted',
      sent_at: day(10),
      recommended: 'doporucena',
      sent_variants: [variant('zaklad', 15_000, 15_000), variant('doporucena', 22_000, 22_000), variant('plus', 35_000, 35_000)],
      chosen_variant: 'plus',
      final_price_czk: 35_000,
      reference_price: false,
      ...over,
    })
    const candidates = [
      base({ company: 'Jen obor', band: 2, status: 'declined', chosen_variant: null, final_price_czk: null }),
      base({ company: 'Jen pásmo', industry: 'Truhlářství', sent_at: day(3) }),
      base({ company: 'Obojí starší', sent_at: day(60) }),
      base({ company: 'Obojí čeká', status: 'sent', chosen_variant: null, final_price_czk: null, sent_at: day(1) }),
      base({ company: 'Týž kontakt', contact_id: own }),
      base({ company: 'Referenční', reference_price: true }),
      base({ company: 'Koncept', status: 'draft', sent_at: null }),
      base({ company: 'E-shop', kind: 'eshop' }),
      base({ company: 'Nic společného', industry: 'Kadeřnictví', band: 3 }),
    ]
    const out = pickSimilar({ kind: 'web', band: 1, industry: 'studny', contactIds: [own] }, candidates, R)
    expect(out.map((o) => o.company)).toEqual(['Obojí starší', 'Obojí čeká', 'Jen pásmo'])
    expect(out[0]).toMatchObject({ match: 'both', recommendedPrice: 22_000, chosen: { name: 'plus', price: 35_000 }, finalPrice: 35_000 })
    expect(out[2].match).toBe('band')
    expect(pickSimilar({ kind: 'web', band: 1, industry: 'Studny', contactIds: [own] }, candidates, R, 10).map((o) => o.company)).toContain(
      'Jen obor',
    )
    // E-shopy si jsou podobné všechny (jedno pásmo).
    expect(pickSimilar({ kind: 'eshop', band: null, industry: null, contactIds: [] }, candidates, R).map((o) => o.company)).toEqual(['E-shop'])
  })

  it('předchozí měsíc v Praze', () => {
    expect(previousPeriod(new Date('2026-12-01T00:30:00+01:00'))).toBe('2026-11')
    expect(previousPeriod(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12')
  })
})

/* ------------------------------------------------------------------ */
/* Databáze: celý tok                                                  */
/* ------------------------------------------------------------------ */

const SCHEMA = `
CREATE TABLE admin_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO admin_settings (id) VALUES (true);
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, company text, email text, phone text,
  ico text, merged_into uuid REFERENCES contacts(id)
);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL, price numeric
);
CREATE TABLE outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_updated_at timestamptz NOT NULL DEFAULT now(),
  company_name text NOT NULL, website text, industry text, city text, research jsonb,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
);
CREATE TABLE project_web_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE project_web_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_id uuid, kind text NOT NULL, is_test boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
`

const migration = (name: string) => fs.readFileSync(path.join(ROOT, 'migrations', name), 'utf8')

async function contact(name = 'Studny Novák'): Promise<string> {
  const res = await db.query<{ id: string }>(`INSERT INTO contacts (display_name, company) VALUES ($1, $1) RETURNING id::text`, [name])
  return res.rows[0].id
}

/** Rozbor, který právě běží, odevzdaný jako úloha → návrh nabídky. */
async function proposalFor(contactId: string, input: unknown = researchInput()): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO offer_research (contact_id, status, brief, claimed_at) VALUES ($1, 'running', $2::jsonb, now()) RETURNING id::text`,
    [contactId, JSON.stringify({ company: 'Studny Novák', prior: [] })],
  )
  expect(await submitResult(res.rows[0].id, input)).toEqual({ ok: true })
  const [proposal] = await listProposalsForContact(contactId)
  return proposal.id
}

async function send(id: string) {
  const p = (await getProposal(id))!
  await updateProposal(
    id,
    {
      inputs: { ...p.inputs },
      variants: p.variants.map((v) => ({ key: v.key, price: v.price, includes: v.includes })),
      recommended: p.recommended,
      intro: p.intro,
    },
    true,
  )
  const out = await publishProposal(id)
  if (!out.ok) throw new Error(out.error)
  return out
}

describe('nabídky nad databází (migrace 136, 137, 142)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    for (const name of ['136_navrhovac_rozbor.sql', '137_navrhovac_fronta.sql', '142_navrhovac_nabidky.sql']) await db.exec(migration(name))
    // Idempotence: druhý běh nic nezmění ani nespadne.
    for (const name of ['136_navrhovac_rozbor.sql', '137_navrhovac_fronta.sql', '142_navrhovac_nabidky.sql']) await db.exec(migration(name))
    setAdminDbForTests(pgliteAdminDriver(db))
  })
  afterAll(async () => {
    setAdminDbForTests(null)
    await db.close()
  })
  beforeEach(() => {
    notifications.length = 0
  })

  it('hotový rozbor připraví koncept nabídky podle pravidel; stránka konceptu neexistuje', async () => {
    const c = await contact()
    const id = await proposalFor(c)
    const p = (await getProposal(id))!
    expect(p.status).toBe('draft')
    expect(p.variants.map((v) => v.price)).toEqual([24_000, 38_000, 53_000])
    expect(p.industry).toBe('Studny')
    expect(await loadPublicOffer(p.public_token)).toBeNull()
    expect(notifications.some((n) => n.type === 'offer_research_done')).toBe(true)
  })

  it('cena nad stropem odejde až po potvrzení; odeslaná nabídka má snímek cen a lhůtu', async () => {
    const c = await contact()
    const id = await proposalFor(c)
    expect(await publishProposal(id)).toEqual({ ok: false, error: 'needs_confirmation' })
    const other = await contact('Jiný')
    const p = (await getProposal(id))!
    await updateProposal(id, { inputs: p.inputs, variants: p.variants, recommended: p.recommended, intro: p.intro }, true)
    expect(await publishProposal(id, other)).toEqual({ ok: false, error: 'wrong_contact' })
    const out = await publishProposal(id, c)
    expect(out.ok).toBe(true)
    const sent = (await getProposal(id))!
    expect(sent.status).toBe('sent')
    expect(sent.sent_variants?.map((v) => v.price)).toEqual([24_000, 38_000, 53_000])
    const days = (Date.parse(sent.valid_until as string) - Date.parse(sent.sent_at as string)) / 86_400_000
    expect(Math.round(days)).toBe(14)
    // Odeslanou už měnit nejde.
    expect((await updateProposal(id, { inputs: p.inputs, variants: p.variants, recommended: 'plus', intro: '' }, true)).ok).toBe(false)
  })

  it('dvě otevření ve stejném okamžiku dají do zvonku jen jedno upozornění', async () => {
    const c = await contact()
    const id = await proposalFor(c)
    const { token } = await send(id)
    // V jedné transakci vrací now() pořád stejný čas: tak vypadá souběh dvou
    // otevření, na kterém dřívější podmínka opened_at = last_opened_at selhala.
    await db.exec('BEGIN')
    await markOpened(token)
    await markOpened(token)
    await db.exec('COMMIT')
    expect((await getProposal(id))!.open_count).toBe(2)
    expect(notifications.filter((n) => n.type === 'offer_opened')).toHaveLength(1)
  })

  it('klient: stránka bez odhadu, otevření jednou do zvonku, výběr varianty = přijal', async () => {
    const c = await contact()
    const id = await proposalFor(c)
    const { token } = await send(id)
    const page = await loadPublicOffer(token)
    expect(page?.offer.variants).toHaveLength(3)
    expect(JSON.stringify(page)).not.toContain('obrat')

    await markOpened(token)
    await markOpened(token)
    expect((await getProposal(id))!.open_count).toBe(2)
    expect(notifications.filter((n) => n.type === 'offer_opened')).toHaveLength(1)

    expect(await chooseVariant(token, 'doporucena', true)).toEqual({ ok: true })
    const chosen = (await getProposal(id))!
    expect(chosen).toMatchObject({ status: 'accepted', chosen_variant: 'doporucena', chosen_management: true, outcome_source: 'client' })
    expect(notifications.find((n) => n.type === 'offer_chosen')?.title).toContain('Doporučená')

    await db.query(`UPDATE offer_proposals SET valid_until = now() - interval '1 day' WHERE id = $1`, [id])
    expect(await chooseVariant(token, 'plus', false)).toEqual({ ok: false, error: 'expired' })
  })

  it('zakázka u kontaktu (i sloučeného) = přijal s cenou zakázky; změna ceny se propíše', async () => {
    const root = await contact('Kořen')
    const child = await contact('Kořen duplicitní')
    await db.query(`UPDATE contacts SET merged_into = $1 WHERE id = $2`, [root, child])
    const id = await proposalFor(child)
    await send(id)
    const project = await db.query<{ id: string }>(
      `INSERT INTO projects (client_name, contact_id, price) VALUES ('Kořen', $1, 40000) RETURNING id::text`,
      [root],
    )
    const p = (await getProposal(id))!
    expect(p).toMatchObject({ status: 'accepted', outcome_source: 'project', final_price_czk: 40_000, project_id: project.rows[0].id })
    const research = await db.query<{ project_id: string }>(`SELECT project_id::text FROM offer_research WHERE id = $1`, [p.research_id])
    expect(research.rows[0].project_id).toBe(project.rows[0].id)

    await db.query(`UPDATE projects SET price = 42500 WHERE id = $1`, [project.rows[0].id])
    expect((await getProposal(id))!.final_price_czk).toBe(42_500)
    // Zakázka už je, výsledek nikdo nepřepíše.
    expect(await setOutcome(id, 'declined')).toBeNull()
  })

  it('14 dní bez odpovědi = neodpověděl; odmítl a Zpět; úklid po 12 měsících', async () => {
    const c = await contact()
    const id = await proposalFor(c)
    await send(id)
    await db.query(`UPDATE offer_proposals SET valid_until = now() - interval '1 minute' WHERE id = $1`, [id])
    expect((await maintainOfferProposals()).noReply).toBeGreaterThanOrEqual(1)
    expect((await getProposal(id))!).toMatchObject({ status: 'no_reply', outcome_source: 'timeout' })

    expect((await setOutcome(id, 'declined'))?.status).toBe('declined')
    expect((await setOutcome(id, 'sent'))?.status).toBe('no_reply')

    await db.query(`UPDATE offer_proposals SET updated_at = now() - interval '13 months' WHERE id = $1`, [id])
    expect(await purgeOfferProposals()).toBeGreaterThanOrEqual(1)
    expect(await getProposal(id)).toBeNull()
  })

  it('pravidla: uložení zvýší verzi, nový návrh je podle nich', async () => {
    const next = structuredClone(R)
    next.bands[2].ranges.zaklad = { min: 30_000, max: 30_000 }
    next.bands[2].ranges.doporucena = { min: 31_000, max: 31_000 }
    next.bands[2].ranges.plus = { min: 32_000, max: 32_000 }
    const saved = await savePricingRules(next)
    expect(saved?.version).toBe(2)
    expect(await savePricingRules({ ...next, floor: -1 })).toBeNull()
    const id = await proposalFor(await contact())
    expect((await getProposal(id))!.variants.map((v) => v.price)).toEqual([30_000, 31_000, 32_000])
    expect((await getProposal(id))!.rules_version).toBe(2)
    await savePricingRules(R)
  })

  it('návrhy úprav pravidel: jednou, přijetí uloží verzi, Zpět vrátí původní ceny', async () => {
    await db.query(`DELETE FROM offer_proposals`)
    const c = await contact()
    const variants = [variant('zaklad', 15_000, 15_000), variant('doporucena', 26_000, 22_000), variant('plus', 35_000, 35_000)]
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO offer_proposals (contact_id, status, company, kind, band, inputs, value, variants, sent_variants, sent_at)
         VALUES ($1, 'accepted', 'Firma', 'web', 1, '{}'::jsonb, '{}'::jsonb, $2::jsonb, $2::jsonb, now() - interval '5 days')`,
        [c, JSON.stringify(variants)],
      )
    }
    const first = await createSuggestions('2026-11')
    expect(first.created).toBe(2)
    expect((await createSuggestions('2026-11')).created).toBe(0)

    const { rules: before } = await loadPricingRules()
    const raise = await db.query<{ id: string }>(`SELECT id::text FROM offer_rule_suggestions WHERE kind = 'raise_band'`)
    const accepted = await acceptSuggestion(raise.rows[0].id)
    expect(accepted.ok).toBe(true)
    const { rules: after } = await loadPricingRules()
    expect(after.version).toBe(before.version + 1)
    expect(after.bands[1].ranges.zaklad.max).toBe(20_000)

    expect(await undoSuggestion(raise.rows[0].id)).toBe(true)
    const { rules: restored } = await loadPricingRules()
    expect(restored.bands[1].ranges).toEqual(before.bands[1].ranges)
    expect(restored.version).toBe(after.version + 1)
    const status = await db.query<{ status: string }>(`SELECT status FROM offer_rule_suggestions WHERE id = $1`, [raise.rows[0].id])
    expect(status.rows[0].status).toBe('pending')
  })

  it('měsíční vyhodnocení jen jednou za měsíc, ohlásí se ve zvonku', async () => {
    const now = new Date()
    const first = await runMonthlyOfferReview(now)
    expect(first?.period).toBe(previousPeriod(now))
    expect(await runMonthlyOfferReview(now)).toBeNull()
    expect(notifications.filter((n) => n.type === 'offer_review')).toHaveLength(1)
  })

  it('podobné nabídky nad databází: odeslaná nabídka jiné firmě ano, sloučený kontakt ne', async () => {
    await db.query(`DELETE FROM offer_proposals`)
    const other = await contact('Studny Dvořák')
    await send(await proposalFor(other))
    const c = await contact('Studny Novák 2')
    const merged = await contact('Studny Novák, starý kontakt')
    await db.query(`UPDATE contacts SET merged_into = $1 WHERE id = $2`, [c, merged])
    await send(await proposalFor(merged))
    const draft = (await getProposal(await proposalFor(c)))!
    expect(draft.status).toBe('draft')
    const similar = await listSimilarOffers(draft, R)
    expect(similar.map((s) => s.contactId)).toEqual([other])
    expect(similar[0]).toMatchObject({ match: 'both', status: 'sent', recommendedPrice: 38_000 })
  })

  it('N4 nad databází: poptávky z webu zakázky proti odhadu', async () => {
    await db.query(`DELETE FROM offer_proposals`)
    const c = await contact('Web s počítáním')
    const project = await db.query<{ id: string }>(`INSERT INTO projects (client_name, price) VALUES ('X', 30000) RETURNING id::text`)
    const pid = project.rows[0].id
    await db.query(`INSERT INTO project_web_keys (project_id, created_at) VALUES ($1, now() - interval '7 months')`, [pid])
    for (let i = 0; i < 30; i++) {
      await db.query(
        `INSERT INTO project_web_events (project_id, kind, created_at) VALUES ($1, 'poptavka', now() - interval '7 months' + interval '1 day' * $2)`,
        [pid, i * 5],
      )
    }
    await db.query(`INSERT INTO project_web_events (project_id, kind, is_test) VALUES ($1, 'poptavka', true)`, [pid])
    await db.query(
      `INSERT INTO offer_proposals (contact_id, project_id, status, company, kind, band, inputs, value, variants, sent_at, industry)
       VALUES ($1, $2, 'accepted', 'Web s počítáním', 'web', 1, '{}'::jsonb, '{"inquiries":{"min":3,"max":6}}'::jsonb, '[]'::jsonb, now() - interval '8 months', 'Studny')`,
      [c, pid],
    )
    const { review } = await loadOfferReview()
    expect(review.actual).toHaveLength(1)
    // 30 poptávek během prvních 150 dní od klíče, testovací se nepočítá: 5 měsíčně, odhad 3–6.
    expect(review.actual[0].months).toBe(6)
    expect(review.actual[0].verdict).toBe('within')
  })
})
