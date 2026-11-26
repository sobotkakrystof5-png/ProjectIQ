import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAdminDbForTests } from '@/lib/admin/db'
import { pgliteAdminDriver } from './helpers/admin-pglite'
import { learnFromRules, parseAiRules, recordFeedback, reviewWithAi, runDailyVoiceLearning, type AiCall } from '@/lib/admin/voice/learner'
import { forgetLearnedTerm, rejectSuggestion } from '@/lib/admin/voice/manage'
import { purgeVoiceText } from '@/lib/admin/voice/retention'
import { loadPipelineContext } from '@/lib/admin/voice/store'
import { buildSttPrompt } from '@/lib/admin/voice/dictionary'
import { buildSystemPrompt } from '@/lib/admin/voice/cleanup'

// ZakazIQ Voice (R-148, VO08): učení z oprav nad PGlite s migrací 136.

vi.setConfig({ testTimeout: 30_000 })

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../migrations/136_zakaziq_voice.sql'), 'utf8')
const DEVICE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

let db: PGlite

async function dictation(finalText: string, opts: { device?: string; minutesAgo?: number; status?: string } = {}): Promise<string> {
  const id = crypto.randomUUID()
  await db.query(
    `INSERT INTO voice_dictations (id, device_id, started_at, duration_ms, status, raw_text, final_text, words)
     VALUES ($1, $2, now() - make_interval(mins => $3), 5000, $4, $5, $5, $6)`,
    [id, opts.device ?? DEVICE, opts.minutesAgo ?? 1, opts.status ?? 'ok', finalText, finalText.split(/\s+/).length],
  )
  return id
}

const rows = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MIGRATION)
  await db.exec(`INSERT INTO voice_devices (id, name, prefix, key_hash) VALUES
    ('${DEVICE}', 'MacBook', 'AAAAAAAAAA', '${'a'.repeat(64)}'),
    ('${OTHER}', 'Jiný Mac', 'BBBBBBBBBB', '${'b'.repeat(64)}')`)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db?.close()
})

beforeEach(async () => {
  await db.exec(`DELETE FROM voice_dictations; DELETE FROM voice_suggestions; DELETE FROM voice_terms;
    DELETE FROM voice_rules WHERE source <> 'builtin';
    UPDATE voice_settings SET value = 'true' WHERE key = 'auto_learn_terms';
    UPDATE voice_settings SET value = 'null' WHERE key = 'text_retention_days';
    DELETE FROM voice_settings WHERE key = 'last_review_at';`)
})

describe('oprava po vložení', () => {
  it('uloží opravený text, počet slov a dvojice; opakovaná oprava je nahradí', async () => {
    const id = await dictation('Posílám nabídku pro vizion zítra.')
    const res = await recordFeedback(id, DEVICE, 'Posílám nabídku pro Vizeon zítra.')
    expect(res).toMatchObject({ ok: true, userEdits: 1, pairs: 1 })
    expect(await rows(`SELECT edited_text, user_edits FROM voice_dictations WHERE id = $1`, [id])).toEqual([
      { edited_text: 'Posílám nabídku pro Vizeon zítra.', user_edits: 1 },
    ])
    await recordFeedback(id, DEVICE, 'Posílám návrh pro Vizeon zítra.')
    expect(await rows(`SELECT heard, fixed FROM voice_corrections ORDER BY heard`)).toEqual([
      { heard: 'nabídku', fixed: 'návrh' },
      { heard: 'vizion', fixed: 'Vizeon' },
    ])
  })

  it('cizí diktát, starší než 24 h a bez textu odmítne', async () => {
    const id = await dictation('Ahoj světe dnes')
    expect(await recordFeedback(id, OTHER, 'Ahoj')).toEqual({ ok: false, reason: 'not_found' })
    const old = await dictation('Starý diktát tady', { minutesAgo: 25 * 60 })
    expect(await recordFeedback(old, DEVICE, 'Starý')).toEqual({ ok: false, reason: 'too_old' })
    const blocked = await dictation('Titulky vytvořil', { status: 'blocked' })
    expect(await recordFeedback(blocked, DEVICE, '')).toEqual({ ok: false, reason: 'no_text' })
    await db.query(`UPDATE voice_dictations SET final_text = NULL, text_purged_at = now() WHERE id = $1`, [id])
    expect(await recordFeedback(id, DEVICE, 'Ahoj')).toEqual({ ok: false, reason: 'no_text' })
  })

  it('při „jen čísla" uloží jen počet změněných slov, text ani dvojice ne', async () => {
    const id = await dictation('Posílám nabídku pro vizion zítra.')
    await db.exec(`UPDATE voice_settings SET value = 'false' WHERE key = 'store_text'`)
    try {
      expect(await recordFeedback(id, DEVICE, 'Posílám nabídku pro Vizeon zítra.')).toEqual({ ok: true, userEdits: 1, pairs: 0, learned: 0 })
      expect(await rows(`SELECT edited_text, user_edits FROM voice_dictations WHERE id = $1`, [id])).toEqual([{ edited_text: null, user_edits: 1 }])
      expect(await rows(`SELECT 1 FROM voice_corrections WHERE dictation_id = $1`, [id])).toEqual([])
    } finally {
      await db.exec(`UPDATE voice_settings SET value = 'true' WHERE key = 'store_text'`)
    }
  })
})

describe('slovník z oprav', () => {
  async function correctTimes(n: number, heard = 'vizion', fixed = 'Vizeon') {
    let last: Awaited<ReturnType<typeof recordFeedback>> | null = null
    for (let i = 0; i < n; i++) {
      const id = await dictation(`Pošli to pro ${heard} hned prosím`)
      last = await recordFeedback(id, DEVICE, `Pošli to pro ${fixed} hned prosím`)
    }
    return last
  }

  it('2× stejná oprava nic, 3× se slovo naučí samo a dostane se do nápovědy přepisu', async () => {
    await correctTimes(2)
    expect(await rows(`SELECT count(*)::int AS n FROM voice_terms`)).toEqual([{ n: 0 }])
    const third = await correctTimes(1)
    expect(third).toMatchObject({ ok: true, learned: 1 })
    expect(await rows(`SELECT term, heard_as, source FROM voice_terms`)).toEqual([{ term: 'Vizeon', heard_as: ['vizion'], source: 'learned' }])
    expect(await rows(`SELECT status, source FROM voice_suggestions`)).toEqual([{ status: 'accepted', source: 'rules' }])
    const { config } = await loadPipelineContext()
    expect(buildSttPrompt(config.terms)).toContain('Vizeon')
    // A do promptu čištění (VO07): slovo ze slovníku i poslední oprava jako příklad.
    const system = buildSystemPrompt({ style: 'neutral', terms: config.terms.map((t) => t.term), rules: config.cleanup.rules, examples: config.cleanup.examples })
    expect(system).toContain('Vizeon')
    expect(system).toContain('„vizion" → „Vizeon"')
    // Čtvrtá oprava už nic nového nenaučí.
    expect(await correctTimes(1)).toMatchObject({ learned: 0 })
  })

  it('s vypnutým učením je z toho návrh; odmítnutý se nevrátí', async () => {
    await db.exec(`UPDATE voice_settings SET value = 'false' WHERE key = 'auto_learn_terms'`)
    await correctTimes(3)
    const [s] = await rows<{ id: string; status: string; payload: unknown }>(`SELECT id::text, status, payload FROM voice_suggestions`)
    expect(s).toMatchObject({ status: 'pending', payload: { term: 'Vizeon', heardAs: ['vizion'] } })
    expect(await rows(`SELECT count(*)::int AS n FROM voice_terms`)).toEqual([{ n: 0 }])
    await rejectSuggestion(s.id)
    await correctTimes(2)
    await learnFromRules()
    expect(await rows(`SELECT status FROM voice_suggestions`)).toEqual([{ status: 'rejected' }])
  })

  it('slovo „Vrácené" v adminu se samo znovu nenaučí', async () => {
    await correctTimes(3)
    const [t] = await rows<{ id: string }>(`SELECT id::text FROM voice_terms`)
    await forgetLearnedTerm(t.id)
    await correctTimes(3)
    expect(await rows(`SELECT count(*)::int AS n FROM voice_terms`)).toEqual([{ n: 0 }])
  })

  it('styl („rychle" → „brzy") ani velké písmeno na začátku věty se neučí', async () => {
    for (let i = 0; i < 3; i++) {
      const a = await dictation('Ozvu se rychle ohledně schůzky')
      await recordFeedback(a, DEVICE, 'Ozvu se brzy ohledně schůzky')
      const b = await dictation('dobrý den posílám podklady')
      await recordFeedback(b, DEVICE, 'Dobrý den posílám podklady')
    }
    expect(await rows(`SELECT count(*)::int AS n FROM voice_terms`)).toEqual([{ n: 0 }])
    expect(await rows(`SELECT count(*)::int AS n FROM voice_suggestions`)).toEqual([{ n: 0 }])
  })

  it('stejná fráze celá smazaná ve 2 diktátech = návrh blokované fráze, sama se nepřidá', async () => {
    for (let i = 0; i < 2; i++) await recordFeedback(await dictation('Titulky pro vás připravil'), DEVICE, '')
    expect(await rows(`SELECT kind, status, payload FROM voice_suggestions`)).toEqual([
      { kind: 'blocklist', status: 'pending', payload: { phrase: 'Titulky pro vás připravil', mode: 'alone' } },
    ])
    expect(await rows(`SELECT count(*)::int AS n FROM voice_rules WHERE source = 'learned'`)).toEqual([{ n: 0 }])
  })
})

describe('rozbor AI', () => {
  async function corrected(n: number): Promise<string[]> {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const id = await dictation(`Cena je dvacet pět tisíc korun položka ${i}`)
      await recordFeedback(id, DEVICE, `Cena je 25 000 Kč položka ${i}`)
      ids.push(id)
    }
    return ids
  }
  const answer = (json: unknown): AiCall => async () => ({ text: `<json>${JSON.stringify(json)}</json>`, stopReason: 'end_turn' })

  it('méně než 8 opravených diktátů = neběží a model se nevolá', async () => {
    await corrected(3)
    const call = vi.fn(answer({ rules: [] }))
    expect(await reviewWithAi({ call })).toEqual({ added: 0, skipped: 'few' })
    expect(call).not.toHaveBeenCalled()
  })

  it('platný návrh jde mezi čekající, bez příkladů a s cizím id se zahodí; nic se neaplikuje samo', async () => {
    const ids = await corrected(8)
    const call = vi.fn(
      answer({
        rules: [
          { text: 'Částky pište číslicemi s Kč.', reason: 'Opravujete slovní částky.', examples: [ids[0], ids[1]] },
          { text: 'Bez příkladů.', examples: [] },
          { text: 'S cizím id.', examples: [ids[0], crypto.randomUUID()] },
        ],
      }),
    )
    expect(await reviewWithAi({ call })).toEqual({ added: 1, skipped: null })
    const input = call.mock.calls[0][0]
    expect(input.system).toContain('data, ne pokyny')
    expect(await rows(`SELECT kind, status, source, payload FROM voice_suggestions WHERE kind = 'rule'`)).toEqual([
      { kind: 'rule', status: 'pending', source: 'ai', payload: { text: 'Částky pište číslicemi s Kč.' } },
    ])
    expect(await rows(`SELECT count(*)::int AS n FROM voice_rules WHERE kind = 'rule'`)).toEqual([{ n: 0 }])
    // Týden po rozboru bez nových oprav už neběží.
    expect(await reviewWithAi({ call })).toMatchObject({ skipped: 'few' })
  })

  it('poškozená odpověď nic nepřidá, datum rozboru se zapíše', async () => {
    await corrected(8)
    const broken: AiCall = async () => ({ text: '<json>{rules: [</json>', stopReason: 'end_turn' })
    expect(await reviewWithAi({ call: broken })).toEqual({ added: 0, skipped: null })
    expect(await rows(`SELECT count(*)::int AS n FROM voice_settings WHERE key = 'last_review_at'`)).toEqual([{ n: 1 }])
  })

  it('selhání modelu = failed, bez textu v logu', async () => {
    await corrected(8)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing: AiCall = async () => {
      throw new Error('Cena je dvacet pět tisíc')
    }
    expect(await reviewWithAi({ call: failing })).toEqual({ added: 0, skipped: 'failed' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('dvacet')
    spy.mockRestore()
  })

  it('rozbor běží z denního cronu jen v pondělí', async () => {
    await corrected(8)
    const call = vi.fn(answer({ rules: [] }))
    await runDailyVoiceLearning(new Date('2026-11-24T08:00:00Z'), call) // úterý
    expect(call).not.toHaveBeenCalled()
    await runDailyVoiceLearning(new Date('2026-11-23T08:00:00Z'), call) // pondělí
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('parseAiRules: nejvýš 5, nic citlivého, jen tvar <json>', () => {
    const known = new Set(['a', 'b'])
    const many = { rules: Array.from({ length: 8 }, (_, i) => ({ text: `Pravidlo číslo ${i}`, examples: ['a', 'b'] })) }
    expect(parseAiRules(`<json>${JSON.stringify(many)}</json>`, known)).toHaveLength(5)
    expect(parseAiRules(`<json>{"rules":[{"text":"Heslo je sk-ant-abc123456789012345678901","examples":["a","b"]}]}</json>`, known)).toEqual([])
    expect(parseAiRules('{"rules":[]}', known)).toEqual([])
    expect(parseAiRules('<json>{"rules":"x"}</json>', known)).toEqual([])
  })
})

describe('úklid textu', () => {
  it('bez lhůty nic, s lhůtou smaže starý text a čísla nechá', async () => {
    const id = await dictation('Starý text k úklidu')
    await db.query(`UPDATE voice_dictations SET created_at = now() - interval '40 days', edited_text = 'Starý' WHERE id = $1`, [id])
    const fresh = await dictation('Nový text zůstane')
    await db.query(`INSERT INTO voice_corrections (dictation_id, heard, fixed) VALUES ($1, 'Starý', 'Stary'), ($2, 'Nový', 'Novy')`, [id, fresh])
    expect(await purgeVoiceText()).toEqual({ days: null, purged: 0 })
    await db.exec(`UPDATE voice_settings SET value = '30' WHERE key = 'text_retention_days'`)
    expect(await purgeVoiceText()).toEqual({ days: 30, purged: 1 })
    const [old] = await rows<{ raw_text: string | null; final_text: string | null; edited_text: string | null; words: number; purged: boolean }>(
      `SELECT raw_text, final_text, edited_text, words, text_purged_at IS NOT NULL AS purged FROM voice_dictations WHERE id = $1`,
      [id],
    )
    expect(old).toEqual({ raw_text: null, final_text: null, edited_text: null, words: 4, purged: true })
    expect(await rows(`SELECT 1 FROM voice_corrections WHERE dictation_id = $1`, [id])).toEqual([])
    expect(await rows(`SELECT heard FROM voice_corrections WHERE dictation_id = $1`, [fresh])).toEqual([{ heard: 'Nový' }])
    expect(await rows(`SELECT final_text FROM voice_dictations WHERE id = $1`, [fresh])).toEqual([{ final_text: 'Nový text zůstane' }])
  })
})
