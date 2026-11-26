import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from './helpers/admin-pglite'
import {
  loadMacStats,
  loadVoiceDictionary,
  loadVoiceHistory,
  loadVoiceLearning,
  loadVoiceOverview,
  mapVoiceToday,
  voiceTodayQuery,
} from '@/lib/admin/voice/queries'
import {
  acceptSuggestion,
  countDictations,
  deleteDictations,
  deleteRule,
  forgetLearnedTerm,
  rejectSuggestion,
  restoreTerm,
  saveSettings,
  undoSuggestion,
} from '@/lib/admin/voice/manage'

// ZakazIQ Voice (R-148, VO10): dotazy a zápisy adminu nad PGlite s migrací 136.

vi.setConfig({ testTimeout: 30_000 })

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../migrations/136_zakaziq_voice.sql'), 'utf8')
const TODAY = '2026-11-26'

let db: PGlite

type Row = {
  id?: string
  started_at: string
  status?: string
  words?: number
  speech_ms?: number | null
  duration_ms?: number
  category?: string
  app_name?: string | null
  raw_text?: string | null
  final_text?: string | null
  edited_text?: string | null
  user_edits?: number
  guards?: string[]
  total_ms?: number | null
  cost_usd?: number
}

async function insert(r: Row): Promise<string> {
  const id = r.id ?? crypto.randomUUID()
  await db.query(
    `INSERT INTO voice_dictations (id, started_at, duration_ms, speech_ms, category, app_name, status, words,
       raw_text, final_text, edited_text, user_edits, guards, total_ms, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      r.started_at,
      r.duration_ms ?? 6000,
      r.speech_ms === undefined ? 5000 : r.speech_ms,
      r.category ?? 'other',
      r.app_name ?? null,
      r.status ?? 'ok',
      r.words ?? 10,
      r.raw_text ?? null,
      r.final_text ?? null,
      r.edited_text ?? null,
      r.user_edits ?? 0,
      r.guards ?? [],
      r.total_ms === undefined ? 1000 : r.total_ms,
      r.cost_usd ?? 0,
    ],
  )
  return id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MIGRATION)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db?.close()
})

beforeEach(async () => {
  await db.exec(`DELETE FROM voice_dictations; DELETE FROM voice_suggestions; DELETE FROM voice_terms;
                 DELETE FROM voice_rules WHERE source <> 'builtin'; UPDATE voice_rules SET active = true;`)
})

describe('přehled', () => {
  it('sčítá slova po pražských dnech — diktát v 0:30 Prahy patří dnešku', async () => {
    await insert({ started_at: '2026-11-25T23:30:00Z', words: 40 }) // 26. 11. 0:30 v Praze
    await insert({ started_at: '2026-11-25T22:30:00Z', words: 7 }) // 25. 11. 23:30 v Praze
    await insert({ started_at: '2026-11-26T10:00:00Z', words: 100, status: 'raw' })
    await insert({ started_at: '2026-11-26T11:00:00Z', words: 999, status: 'blocked' }) // nepočítá se
    const res = await loadVoiceOverview(TODAY)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const o = res.data
    expect(o.todayWords).toBe(140)
    expect(o.last30.find((d) => d.day === '2026-11-25')?.words).toBe(7)
    expect(o.weekWords).toBe(147)
    expect(o.total).toMatchObject({ words: 147, dictations: 3 })
    expect(o.streak).toEqual({ current: 2, longest: 2 })
    expect(o.statuses).toMatchObject({ ok: 2, raw: 1, blocked: 1 })
    expect(o.last30).toHaveLength(30)
    expect(o.heatmap).toHaveLength(26)
  })

  it('kategorie, aplikace, hodiny, pojistky, odezva a náklady', async () => {
    await insert({ started_at: '2026-11-26T08:00:00Z', words: 30, category: 'email', app_name: 'Mail', guards: ['segments'], total_ms: 800, cost_usd: 0.01 })
    await insert({ started_at: '2026-11-26T08:20:00Z', words: 10, category: 'ai_prompt', app_name: 'Claude', total_ms: 1200, cost_usd: 0.02 })
    await insert({ started_at: '2026-11-02T08:00:00Z', words: 10, category: 'email', app_name: 'Mail', guards: ['segments', 'blocklist'], cost_usd: 0.5 })
    await insert({ started_at: '2026-11-26T09:00:00Z', words: 0, status: 'error', guards: ['stt_failed'], total_ms: null, cost_usd: 0 })
    const res = await loadVoiceOverview(TODAY)
    if (!res.ok) throw new Error('chybí tabulky')
    const o = res.data
    expect(o.categories.map((c) => [c.category, c.words, c.share])).toEqual([
      ['email', 40, 80],
      ['ai_prompt', 10, 20],
    ])
    expect(o.apps[0]).toEqual({ name: 'Mail', words: 40, dictations: 2 })
    expect(o.hours[9]).toBe(50) // tři diktáty v 8:xx UTC = 9:xx v Praze (i ten z 2. 11.)
    expect(o.guards.find((g) => g.code === 'segments')?.count).toBe(2)
    expect(o.latency.p50).toBe(1000)
    expect(o.cost.today).toBeCloseTo(0.03)
    expect(o.cost.month).toBeCloseTo(0.53)
  })

  it('rychlost jen z diktátů s řečí aspoň 2 s, bez speech_ms podle délky nahrávky', async () => {
    await insert({ started_at: '2026-11-26T08:00:00Z', words: 100, speech_ms: 60_000 })
    await insert({ started_at: '2026-11-26T08:10:00Z', words: 50, speech_ms: null, duration_ms: 30_000 })
    await insert({ started_at: '2026-11-26T08:20:00Z', words: 40, speech_ms: 1000 }) // krátký, nepočítá se do rychlosti
    const res = await loadVoiceOverview(TODAY)
    if (!res.ok) throw new Error('chybí tabulky')
    expect(res.data.total.wpm).toBe(100) // 150 slov / 1,5 min
  })

  it('podíl opravených diktátů po týdnech', async () => {
    await insert({ started_at: '2026-11-24T08:00:00Z', user_edits: 2 })
    await insert({ started_at: '2026-11-24T09:00:00Z' })
    await insert({ started_at: '2026-11-17T09:00:00Z', user_edits: 1 })
    const res = await loadVoiceOverview(TODAY)
    if (!res.ok) throw new Error('chybí tabulky')
    expect(res.data.editShare).toEqual([
      { week: '2026-11-16', edited: 1, dictations: 1, percent: 100 },
      { week: '2026-11-23', edited: 1, dictations: 2, percent: 50 },
    ])
  })

  it('karta na Dnes: dnešní slova a série; bez diktátu null', async () => {
    const empty = (await db.query(voiceTodayQuery(TODAY).text, [...voiceTodayQuery(TODAY).params])).rows
    expect(mapVoiceToday(empty as never, TODAY)).toBeNull()
    await insert({ started_at: '2026-11-25T10:00:00Z', words: 5 })
    await insert({ started_at: '2026-11-26T10:00:00Z', words: 12 })
    const q = voiceTodayQuery(TODAY)
    const rows = (await db.query(q.text, [...q.params])).rows
    expect(mapVoiceToday(rows as never, TODAY)).toEqual({ words: 12, streak: 2 })
    expect(mapVoiceToday(undefined, TODAY)).toBeNull()
  })

  it('okno na Macu dostane tatáž čísla', async () => {
    await insert({ started_at: '2026-11-26T10:00:00Z', words: 120, speech_ms: 60_000 })
    await insert({ started_at: '2026-11-20T10:00:00Z', words: 30, speech_ms: 30_000 })
    const s = await loadMacStats('7d', TODAY)
    expect(s).toMatchObject({ range: '7d', today: 120, week: 150, words: 150, streak: 1, wpm: 100 })
    expect(s.daily).toHaveLength(7)
    expect(s.timeSaved).toBe(Math.round(150 / 40 - 1.5))
    const all = await loadMacStats('all', TODAY)
    expect(all.words).toBe(150)
    expect(all.daily).toHaveLength(365)
  })
})

describe('historie', () => {
  it('hledá v textu a % bere jako obyčejný znak', async () => {
    await insert({ started_at: '2026-11-26T10:00:00Z', final_text: 'Sleva 20 % pro Nováka' })
    await insert({ started_at: '2026-11-26T11:00:00Z', final_text: 'Sleva 2000 Kč' })
    await insert({ started_at: '2026-11-26T12:00:00Z', raw_text: 'Titulky', status: 'blocked', words: 0 })
    const hit = await loadVoiceHistory({ query: '20 %', status: null })
    if (!hit.ok) throw new Error('chybí tabulky')
    expect(hit.data.items.map((i) => i.finalText)).toEqual(['Sleva 20 % pro Nováka'])
    const blocked = await loadVoiceHistory({ query: null, status: 'blocked' })
    if (!blocked.ok) throw new Error('chybí tabulky')
    expect(blocked.data.matching).toBe(1)
    expect(blocked.data.storeText).toBe(true)
  })

  it('smaže podle hledání jen nalezené, i s opravami', async () => {
    const a = await insert({ started_at: '2026-11-26T10:00:00Z', final_text: 'Klient Novák volal' })
    await insert({ started_at: '2026-11-26T11:00:00Z', final_text: 'Něco jiného' })
    await db.query(`INSERT INTO voice_corrections (dictation_id, heard, fixed) VALUES ($1, 'novak', 'Novák')`, [a])
    const scope = { kind: 'search' as const, filter: { query: 'novák', status: null } }
    expect(await countDictations(scope)).toBe(1)
    expect(await deleteDictations(scope)).toBe(1)
    expect((await db.query(`SELECT count(*)::int AS n FROM voice_dictations`)).rows).toEqual([{ n: 1 }])
    expect((await db.query(`SELECT count(*)::int AS n FROM voice_corrections`)).rows).toEqual([{ n: 0 }])
  })

  it('smaže období podle pražských dnů', async () => {
    await insert({ started_at: '2026-11-24T23:30:00Z' }) // 25. 11. v Praze
    await insert({ started_at: '2026-11-24T22:30:00Z' }) // 24. 11. v Praze
    expect(await deleteDictations({ kind: 'range', from: '2026-11-25', to: '2026-11-26' })).toBe(1)
  })
})

describe('učení', () => {
  async function suggest(kind: string, payload: object, examples: string[] = []) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO voice_suggestions (kind, payload, examples, dedupe_key) VALUES ($1, $2::jsonb, $3::uuid[], $4) RETURNING id::text`,
      [kind, JSON.stringify(payload), examples, `${kind}:${crypto.randomUUID()}`],
    )
    return rows[0].id
  }

  it('přijetí slova ho přidá, Zpět ho zase smaže', async () => {
    const d = await insert({ started_at: '2026-11-26T10:00:00Z', final_text: 'dilkovna', edited_text: 'Dílkovna' })
    const id = await suggest('term', { term: 'Dílkovna', heardAs: ['dilkovna'] }, [d])
    const learning = await loadVoiceLearning()
    if (!learning.ok) throw new Error('chybí tabulky')
    expect(learning.pending).toBe(1)
    expect(learning.data.suggestions[0]).toMatchObject({ title: 'Dílkovna', heardAs: ['dilkovna'] })
    expect(learning.data.suggestions[0].examples[0]).toMatchObject({ before: 'dilkovna', after: 'Dílkovna' })

    expect(await acceptSuggestion(id)).toBe('ok')
    expect(await acceptSuggestion(id)).toBe('gone')
    expect((await db.query(`SELECT term, heard_as, source FROM voice_terms`)).rows).toEqual([
      { term: 'Dílkovna', heard_as: ['dilkovna'], source: 'learned' },
    ])
    expect(await undoSuggestion(id)).toBe(true)
    expect((await db.query(`SELECT count(*)::int AS n FROM voice_terms`)).rows).toEqual([{ n: 0 }])
    expect((await db.query(`SELECT status, payload ? '_applied' AS has FROM voice_suggestions`)).rows).toEqual([{ status: 'pending', has: false }])
  })

  it('přijetí slova, které už ve slovníku je, doplní varianty a Zpět vrátí původní', async () => {
    await db.query(`INSERT INTO voice_terms (kind, term, heard_as) VALUES ('term', 'ZakazIQ', ARRAY['zakaz iq'])`)
    const id = await suggest('term', { term: 'zakaziq', heardAs: ['zakáz ajkjů'] })
    expect(await acceptSuggestion(id)).toBe('ok')
    expect((await db.query(`SELECT heard_as FROM voice_terms`)).rows).toEqual([{ heard_as: ['zakaz iq', 'zakáz ajkjů'] }])
    expect(await undoSuggestion(id)).toBe(true)
    expect((await db.query(`SELECT term, heard_as FROM voice_terms`)).rows).toEqual([{ term: 'ZakazIQ', heard_as: ['zakaz iq'] }])
  })

  it('blokovaná fráze a pravidlo; odmítnutí jde vrátit', async () => {
    const b = await suggest('blocklist', { phrase: 'Titulky pro vás připravil', mode: 'alone' })
    const r = await suggest('rule', { text: 'Čísla do deseti pište slovy.' })
    expect(await acceptSuggestion(b)).toBe('ok')
    expect(await rejectSuggestion(r)).toBe(true)
    const dict = await loadVoiceDictionary()
    if (!dict.ok) throw new Error('chybí tabulky')
    expect(dict.data.blocklist.find((x) => x.text === 'Titulky pro vás připravil')).toMatchObject({ source: 'learned', mode: 'alone' })
    expect(dict.data.rules).toEqual([])
    expect(await undoSuggestion(r)).toBe(true)
    expect((await db.query(`SELECT status FROM voice_suggestions WHERE id = $1`, [r])).rows).toEqual([{ status: 'pending' }])
  })

  it('poškozený návrh přijmout nejde', async () => {
    const id = await suggest('term', { nic: true })
    expect(await acceptSuggestion(id)).toBe('invalid')
  })

  it('Vrátit naučené slovo ho smaže a návrh odmítne; Zpět ho vrátí', async () => {
    const id = await suggest('term', { term: 'Dílkovník', heardAs: ['dilkovnik'] })
    await acceptSuggestion(id)
    const term = (await db.query<{ id: string }>(`SELECT id::text FROM voice_terms`)).rows[0]
    const snap = await forgetLearnedTerm(term.id)
    expect(snap).toMatchObject({ term: 'Dílkovník', source: 'learned' })
    expect((await db.query(`SELECT status FROM voice_suggestions`)).rows).toEqual([{ status: 'rejected' }])
    expect(await restoreTerm(snap!)).toBe(true)
    expect((await db.query(`SELECT count(*)::int AS n FROM voice_terms`)).rows).toEqual([{ n: 1 }])
    expect((await db.query(`SELECT status FROM voice_suggestions`)).rows).toEqual([{ status: 'accepted' }])
  })

  it('vestavěnou frázi smazat nejde', async () => {
    const builtin = (await db.query<{ id: string }>(`SELECT id::text FROM voice_rules WHERE source = 'builtin' LIMIT 1`)).rows[0]
    expect(await deleteRule(builtin.id)).toBeNull()
  })
})

describe('nastavení a chybějící migrace', () => {
  it('uložené nastavení se přečte zpátky', async () => {
    await saveSettings({ typingWpm: 55, textRetentionDays: 30, storeText: false })
    const res = await loadVoiceLearning()
    if (!res.ok) throw new Error('chybí tabulky')
    const s = (await db.query<{ key: string; value: unknown }>(`SELECT key, value FROM voice_settings WHERE key IN ('typing_wpm','text_retention_days','store_text') ORDER BY key`)).rows
    expect(s).toEqual([
      { key: 'store_text', value: false },
      { key: 'text_retention_days', value: 30 },
      { key: 'typing_wpm', value: 55 },
    ])
    await saveSettings({ typingWpm: 40, textRetentionDays: null, storeText: true })
  })

  it('bez migrace 136 vrátí missing_tables, ne chybu', async () => {
    const empty = new PGlite()
    setAdminDbForTests(pgliteAdminDriver(empty))
    try {
      expect(await loadVoiceOverview(TODAY)).toEqual({ ok: false, reason: 'missing_tables' })
      expect(await loadVoiceHistory({ query: null, status: null })).toEqual({ ok: false, reason: 'missing_tables' })
    } finally {
      setAdminDbForTests(pgliteAdminDriver(db))
      await empty.close()
    }
  })
})
