import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// ZakazIQ Voice (R-148, VO01): migrace 136 nad čistou PGlite, dvakrát po sobě.

const MIGRATION = fs.readFileSync(path.join(__dirname, '../../migrations/136_zakaziq_voice.sql'), 'utf8')

const TABLES = [
  'voice_devices',
  'voice_dictations',
  'voice_terms',
  'voice_rules',
  'voice_corrections',
  'voice_suggestions',
  'voice_settings',
]

let db: PGlite

async function fingerprint() {
  const { rows } = await db.query<{ t: string; c: string }>(
    `SELECT table_name AS t, string_agg(column_name || ':' || data_type, ',' ORDER BY column_name) AS c
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'voice_%'
     GROUP BY table_name ORDER BY table_name`,
  )
  const counts = await db.query<{ rules: number; settings: number }>(
    `SELECT (SELECT count(*)::int FROM voice_rules) AS rules, (SELECT count(*)::int FROM voice_settings) AS settings`,
  )
  return { columns: rows, ...counts.rows[0] }
}

const dictation = (id: string, extra: Record<string, string> = {}) => {
  const cols = { id: `'${id}'`, started_at: 'now()', duration_ms: '4000', status: `'ok'`, ...extra }
  return `INSERT INTO voice_dictations (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')})`
}

const D1 = '11111111-1111-4111-8111-111111111111'
const D2 = '22222222-2222-4222-8222-222222222222'
const D3 = '33333333-3333-4333-8333-333333333333'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(MIGRATION)
})

afterAll(async () => {
  await db.close()
})

describe('migrace 136 (ZakazIQ Voice)', () => {
  it('založí všech sedm tabulek a druhý běh nic nezmění', async () => {
    const first = await fingerprint()
    expect(first.columns.map((r) => r.t)).toEqual([...TABLES].sort())
    await db.exec(MIGRATION)
    expect(await fingerprint()).toEqual(first)
  })

  it('vestavěné blokované fráze a výchozí nastavení vloží jednou', async () => {
    const rules = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM voice_rules WHERE source = 'builtin'`)
    expect(rules.rows[0].n).toBe(13)
    const settings = await db.query<{ key: string; value: unknown }>(`SELECT key, value FROM voice_settings ORDER BY key`)
    const map = Object.fromEntries(settings.rows.map((r) => [r.key, r.value]))
    expect(map).toMatchObject({
      typing_wpm: 40,
      text_retention_days: null,
      cleanup_enabled: true,
      auto_learn_terms: true,
      store_text: true,
      daily_cost_cap_usd: 1,
    })
    expect(Object.keys(map)).toHaveLength(7)
  })

  it('CHECK odmítne neznámý stav, kategorii a režim', async () => {
    await expect(db.exec(dictation(D3, { status: `'hotovo'` }))).rejects.toThrow()
    await expect(db.exec(dictation(D3, { category: `'sms'` }))).rejects.toThrow()
    await expect(db.exec(dictation(D3, { mode: `'toggle'` }))).rejects.toThrow()
    await expect(db.exec(dictation(D3, { duration_ms: '-1' }))).rejects.toThrow()
  })

  it('klíč zařízení má v DB jen prefix a otisk správného tvaru', async () => {
    await expect(
      db.exec(`INSERT INTO voice_devices (name, prefix, key_hash) VALUES ('Mac', 'kratky', '${'a'.repeat(64)}')`),
    ).rejects.toThrow()
    await expect(
      db.exec(`INSERT INTO voice_devices (name, prefix, key_hash) VALUES ('Mac', 'AbCdEfGhIj', 'zk_voice_celyklic')`),
    ).rejects.toThrow()
    await expect(
      db.exec(`INSERT INTO voice_devices (name, prefix, key_hash) VALUES ('', 'AbCdEfGhIj', '${'a'.repeat(64)}')`),
    ).rejects.toThrow()
  })

  it('slovo ve slovníku je jedinečné bez ohledu na velká písmena', async () => {
    await db.exec(`INSERT INTO voice_terms (kind, term, heard_as) VALUES ('term', 'ZakazIQ', '{"zákaz IQ"}')`)
    await expect(db.exec(`INSERT INTO voice_terms (kind, term) VALUES ('term', 'zakaziq')`)).rejects.toThrow()
    // Zkratka se stejným textem je jiný druh, smí existovat.
    await db.exec(`INSERT INTO voice_terms (kind, term, expansion) VALUES ('snippet', 'zakaziq', 'https://www.zakaziq.cz')`)
    // Zkratka bez rozbalení nedává smysl.
    await expect(db.exec(`INSERT INTO voice_terms (kind, term) VALUES ('snippet', 'adresa')`)).rejects.toThrow()
  })

  it('smazání diktátu smaže jeho opravy a vyčistí příklady v návrzích (D-V7)', async () => {
    await db.exec(dictation(D1, { final_text: `'zakaziq je super'` }))
    await db.exec(dictation(D2, { final_text: `'zakaziq znovu'` }))
    await db.exec(`INSERT INTO voice_corrections (dictation_id, heard, fixed) VALUES ('${D1}', 'zakaziq', 'ZakazIQ'), ('${D2}', 'zakaziq', 'ZakazIQ')`)
    await db.exec(`
      INSERT INTO voice_suggestions (kind, payload, evidence, examples, dedupe_key) VALUES
        ('term', '{"term":"ZakazIQ"}', 2, '{${D1},${D2}}', 'term:zakaziq'),
        ('term', '{"term":"Prvotka"}', 1, '{${D1}}', 'term:prvotka')
    `)

    await db.exec(`DELETE FROM voice_dictations WHERE id = '${D1}'`)

    const corrections = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM voice_corrections`)
    expect(corrections.rows[0].n).toBe(1)
    const suggestions = await db.query<{ dedupe_key: string; examples: string[] }>(
      `SELECT dedupe_key, examples FROM voice_suggestions ORDER BY dedupe_key`,
    )
    // Návrh, kterému zbyl příklad, zůstane bez smazaného diktátu; návrh bez příkladů zmizí.
    expect(suggestions.rows).toEqual([{ dedupe_key: 'term:zakaziq', examples: [D2] }])
  })

  it('vyřízený návrh smazáním diktátů nezmizí, jen přijde o příklady', async () => {
    await db.exec(`
      INSERT INTO voice_suggestions (kind, payload, examples, status, dedupe_key, decided_at)
      VALUES ('blocklist', '{"text":"Titulky"}', '{${D2}}', 'accepted', 'blocklist:titulky', now())
    `)
    await db.exec(`DELETE FROM voice_dictations`)
    const rows = await db.query<{ dedupe_key: string; examples: string[] }>(
      `SELECT dedupe_key, examples FROM voice_suggestions ORDER BY dedupe_key`,
    )
    expect(rows.rows).toEqual([{ dedupe_key: 'blocklist:titulky', examples: [] }])
  })

  it('smazané zařízení diktáty neruší', async () => {
    const dev = await db.query<{ id: string }>(
      `INSERT INTO voice_devices (name, prefix, key_hash) VALUES ('Starý Mac', 'ZzZzZzZzZz', '${'b'.repeat(64)}') RETURNING id::text`,
    )
    await db.exec(dictation(D3, { device_id: `'${dev.rows[0].id}'` }))
    await db.exec(`DELETE FROM voice_devices WHERE id = '${dev.rows[0].id}'`)
    const row = await db.query<{ device_id: string | null }>(`SELECT device_id FROM voice_dictations WHERE id = '${D3}'`)
    expect(row.rows[0].device_id).toBeNull()
  })
})
