import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setWsDriverForTests, wsDb } from '../db'
import { getIndustryTemplate, INDUSTRY_TEMPLATES, templateSeedQueries, WS_MODULES } from '../templates'
import { createWsTestDb, ids, pgliteDriver, u } from './helpers/ws-pglite'

// Šablony oborů: každá se musí dát vložit do DB (sedí na CHECK omezení)
// a nesmí si vymýšlet ceny (B10).

let db: PGlite
const A = ids('a')

beforeAll(async () => {
  ;({ db } = await createWsTestDb())
  setWsDriverForTests(pgliteDriver(db))
}, 60_000)

afterAll(async () => {
  setWsDriverForTests(null)
  await db?.close()
})

describe('šablony oborů', () => {
  it('jsou všechny obory ze zadání S06 a z landing page (R-081), „Jiný obor“ poslední', () => {
    expect(INDUSTRY_TEMPLATES.map((t) => t.key)).toEqual([
      'kadernictvi-kosmetika',
      'kavarna-restaurace',
      'fitness-lekce',
      'ucetni-poradci',
      'ordinace-pece',
      'zamecnictvi',
      'studnarstvi',
      'azbest',
      'autoservis',
      'uklid',
      'stavba',
      'vlastni',
    ])
    expect(getIndustryTemplate('neznamy').key).toBe('vlastni')
  })

  it('klíče jsou unikátní a každý obor kromě „Jiný obor“ má aspoň jednu službu', () => {
    const keys = INDUSTRY_TEMPLATES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const t of INDUSTRY_TEMPLATES) {
      if (t.key === 'vlastni') continue
      expect(t.services.length, t.label).toBeGreaterThan(0)
      expect(t.services.length, t.label).toBeLessThanOrEqual(4)
    }
  })

  it('obory z landing page mají slíbené kolonky (R-081)', () => {
    const field = (key: string, label: string) => getIndustryTemplate(key).fields.find((f) => f.label === label)
    expect(field('kavarna-restaurace', 'Počet osob')).toMatchObject({ type: 'number', required: true })
    expect(field('kavarna-restaurace', 'Příležitost')).toMatchObject({ type: 'choice', required: false })
    expect(getIndustryTemplate('fitness-lekce').fields).toEqual([])
    expect(getIndustryTemplate('fitness-lekce').note).toMatch(/lekce/i)
    expect(field('ucetni-poradci', 'O co jde')).toMatchObject({ type: 'choice', required: true })
    expect(field('ordinace-pece', 'Co vás trápí')).toMatchObject({ type: 'text', required: false })
  })

  for (const t of INDUSTRY_TEMPLATES) {
    it(`${t.label}: bez vymyšlených cen, unikátní kolonky, úplné stavy`, () => {
      expect(t.services.every((s) => s.price === null)).toBe(true)
      const keys = t.fields.map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
      const types = t.stages.map((s) => s.type)
      expect(types[0]).toBe('new')
      expect(types).toContain('done')
      expect(types).toContain('cancelled')
      expect(t.modules.every((m) => WS_MODULES.includes(m))).toBe(true)
      for (const f of t.fields) {
        if (f.type === 'choice' || f.type === 'select') expect(f.options?.length).toBeGreaterThan(1)
      }
    })

    it(`${t.label}: jde vložit do DB jako ws_app`, async () => {
      const businessId = u('a', 100 + INDUSTRY_TEMPLATES.indexOf(t))
      const scope = { accountId: A.account, businessId }
      const ws = wsDb(scope)
      await ws`INSERT INTO ws.businesses (id, account_id, name, slug, industry)
               VALUES (${businessId}, ${A.account}, ${t.label}, ${`sablona-${t.key}`}, ${t.key})`
      await ws.batch(templateSeedQueries(scope, t))

      const [counts] = await ws<{ modules: number; enabled: number; services: number; fields: number; stages: number; loyalty_on: boolean }>`
        SELECT
          (SELECT count(*)::int FROM ws.business_modules WHERE account_id = ${A.account} AND business_id = ${businessId}) AS modules,
          (SELECT count(*)::int FROM ws.business_modules WHERE account_id = ${A.account} AND business_id = ${businessId} AND enabled) AS enabled,
          (SELECT count(*)::int FROM ws.services WHERE account_id = ${A.account} AND business_id = ${businessId}) AS services,
          (SELECT count(*)::int FROM ws.field_definitions WHERE account_id = ${A.account} AND business_id = ${businessId}) AS fields,
          (SELECT count(*)::int FROM ws.stages WHERE account_id = ${A.account} AND business_id = ${businessId}) AS stages,
          (SELECT enabled FROM ws.loyalty_programs WHERE account_id = ${A.account} AND business_id = ${businessId}) AS loyalty_on
      `
      expect(counts).toEqual({
        modules: WS_MODULES.length,
        enabled: 2 + t.modules.length,
        services: t.services.length,
        fields: t.fields.length,
        stages: t.stages.length,
        loyalty_on: false,
      })
    })
  }
})
