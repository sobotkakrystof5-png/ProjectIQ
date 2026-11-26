#!/usr/bin/env node
// Ukázková data pro ZakazIQ Voice (VO10, R-148): fiktivní diktáty za 60 dní,
// tři návrhy z učení a jedno naučené slovo, aby šel admin /dashboard/voice
// projít v prohlížeči bez Macu.
//
//   node scripts/voice-seed.mjs                   jen vypíše, co by udělal
//   node scripts/voice-seed.mjs --ano             smaže starou ukázku a vloží novou
//   node scripts/voice-seed.mjs --smazat --ano    jen smaže ukázková data
//   node scripts/voice-seed.mjs --ano --i-s-daty  i když v DB jsou skutečné diktáty
//
// Značka: aplikace „Ukázka …" s bundle id `ukazka.*`, návrhy s klíčem
// `ukazka:*`, vymyšlená slova Dílkovna a Dílkovník. Jiných řádků se skript
// nedotkne. Texty jsou vymyšlené, žádné skutečné údaje.
//
// Pozor: DATABASE_URL v .env.local může mířit na produkci. Pouštět jen na
// testovací databázi (skript se zastaví, když najde skutečné diktáty).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DAYS = 60
const DEMO_TERMS = ['Dílkovna', 'Dílkovník']

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

// Stejná data při každém běhu (kvůli porovnání snímků obrazovky).
function prng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const APPS = [
  { bundle: 'ukazka.mail', name: 'Ukázka Mail', category: 'email', weight: 3 },
  { bundle: 'ukazka.slack', name: 'Ukázka Slack', category: 'work_msg', weight: 4 },
  { bundle: 'ukazka.claude', name: 'Ukázka Claude', category: 'ai_prompt', weight: 5 },
  { bundle: 'ukazka.zpravy', name: 'Ukázka Zprávy', category: 'personal_msg', weight: 2 },
  { bundle: 'ukazka.notion', name: 'Ukázka Notion', category: 'document', weight: 1 },
  { bundle: 'ukazka.prohlizec', name: 'Ukázka Prohlížeč', category: 'other', weight: 1 },
]

const SENTENCES = [
  'Dobrý den, posílám návrh úvodní stránky a prosím o zpětnou vazbu do pátku.',
  'Uprav hlavičku tak, aby logo bylo vlevo a menu vpravo.',
  'Zítra v deset mám schůzku s klientem, připrav mi shrnutí zakázky.',
  'Díky za zprávu, podívám se na to odpoledne.',
  'Přidej do formuláře pole pro telefon a ověř ho na serveru.',
  'Fakturu za druhou etapu pošlu na konci měsíce.',
  'Napiš test, který ověří, že se poptávka uloží i bez předplatného.',
  'Ahoj, dneska to nestihnu, ozvu se zítra ráno.',
  'Shrň mi rozdíly mezi těmi dvěma variantami ceníku.',
  'Do zápisu ze schůzky doplň termín další kontroly.',
]

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)]
}

function pickApp(rand) {
  const total = APPS.reduce((s, a) => s + a.weight, 0)
  let r = rand() * total
  for (const a of APPS) {
    r -= a.weight
    if (r <= 0) return a
  }
  return APPS[0]
}

const words = (t) => (t ? t.split(/\s+/).filter(Boolean).length : 0)

/** Okamžik pražské nástěnné hodiny jako ISO (stejný postup jako lib/prague-time.ts). */
function pragueToIso(day, hour, minute) {
  const [y, m, d] = day.split('-').map(Number)
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute))
  const praHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', hour: 'numeric', hour12: false }).format(guess))
  let offset = praHour - hour
  if (offset > 12) offset -= 24
  if (offset < -12) offset += 24
  return new Date(Date.UTC(y, m - 1, d, hour - offset, minute)).toISOString()
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function pragueToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function buildDictations(today) {
  const rand = prng(20261126)
  const rows = []
  const nowMs = Date.now()
  for (let back = DAYS - 1; back >= 0; back--) {
    const day = addDays(today, -back)
    // Posledních 9 dní každý den (série), dřív občas pauza.
    if (back > 8 && rand() < 0.3) continue
    const count = back === 0 ? 4 : 2 + Math.floor(rand() * 9)
    for (let i = 0; i < count; i++) {
      const hour = 8 + Math.floor(rand() * 12)
      const startedAt = pragueToIso(day, hour, Math.floor(rand() * 60))
      if (Date.parse(startedAt) > nowMs) continue
      const app = pickApp(rand)
      const parts = 1 + Math.floor(rand() * 4)
      const raw = Array.from({ length: parts }, () => pick(rand, SENTENCES)).join(' ')
      const roll = rand()
      const status = roll < 0.8 ? 'ok' : roll < 0.88 ? 'raw' : roll < 0.91 ? 'blocked' : roll < 0.94 ? 'empty' : roll < 0.97 ? 'cancelled' : 'error'
      const counted = status === 'ok' || status === 'raw'
      const finalText = counted ? raw : null
      const n = counted ? words(raw) : 0
      const speechMs = Math.round((n || 3) * (330 + rand() * 120))
      // Starší diktáty se opravovaly častěji — měřítko učení má klesat.
      const edited = counted && rand() < 0.35 * (back / DAYS) + 0.05
      const guards = []
      if (status === 'raw') guards.push(pick(rand, ['cleanup_novel', 'cleanup_length', 'cleanup_numbers']))
      if (status === 'blocked') guards.push('blocklist')
      if (status === 'empty') guards.push('no_speech')
      if (status === 'error') guards.push('stt_failed')
      if (counted && rand() < 0.1) guards.push('segments')
      rows.push({
        id: crypto.randomUUID(),
        started_at: startedAt,
        duration_ms: speechMs + 400 + Math.round(rand() * 800),
        speech_ms: speechMs,
        mode: rand() < 0.85 ? 'hold' : 'hands_free',
        app_bundle_id: app.bundle,
        app_name: app.name,
        category: app.category,
        status,
        guards,
        raw_text: status === 'empty' || status === 'cancelled' || status === 'error' ? null : status === 'blocked' ? 'Titulky vytvořil' : raw,
        final_text: finalText,
        edited_text: edited ? raw.replace('návrh', 'nový návrh') : null,
        words: n,
        words_corrected: status === 'ok' ? Math.floor(rand() * 4) : 0,
        dictionary_fixes: status === 'ok' && rand() < 0.3 ? 1 : 0,
        user_edits: edited ? 1 + Math.floor(rand() * 2) : 0,
        stt_provider: 'groq',
        stt_model: 'whisper-large-v3-turbo',
        llm_model: status === 'ok' ? 'ukazka' : null,
        stt_ms: 300 + Math.round(rand() * 400),
        llm_ms: status === 'ok' ? 300 + Math.round(rand() * 900) : null,
        total_ms: status === 'cancelled' ? null : 700 + Math.round(rand() * 1600),
        cost_usd: status === 'cancelled' ? 0 : Number((0.0002 + rand() * 0.0006).toFixed(6)),
      })
    }
  }
  return rows
}

const COLUMNS = `id uuid, started_at timestamptz, duration_ms int, speech_ms int, mode text, app_bundle_id text,
  app_name text, category text, status text, guards text[], raw_text text, final_text text, edited_text text,
  words int, words_corrected int, dictionary_fixes int, user_edits int, stt_provider text, stt_model text,
  llm_model text, stt_ms int, llm_ms int, total_ms int, cost_usd numeric`

function cleanupQueries() {
  return [
    { text: `DELETE FROM voice_suggestions WHERE dedupe_key LIKE 'ukazka:%'`, params: [] },
    { text: `DELETE FROM voice_terms WHERE kind = 'term' AND term = ANY($1::text[])`, params: [DEMO_TERMS] },
    { text: `DELETE FROM voice_dictations WHERE app_bundle_id LIKE 'ukazka.%' AND app_name LIKE 'Ukázka%'`, params: [] },
  ]
}

function seedQueries(rows) {
  const edited = rows.filter((r) => r.edited_text)
  const ex = (n) => edited.slice(0, n).map((r) => r.id)
  return [
    ...cleanupQueries(),
    {
      text: `INSERT INTO voice_dictations (${COLUMNS.replace(/ [a-z[\]]+(,|$)/g, '$1').replace(/\s+/g, ' ')})
             SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(${COLUMNS})`,
      params: [JSON.stringify(rows)],
    },
    {
      text: `INSERT INTO voice_corrections (dictation_id, heard, fixed)
             SELECT id, 'návrh', 'nový návrh' FROM unnest($1::uuid[]) AS id`,
      params: [edited.map((r) => r.id)],
    },
    {
      text: `INSERT INTO voice_suggestions (kind, payload, evidence, examples, reason, source, dedupe_key) VALUES
               ('term', $1::jsonb, 3, $4::uuid[], NULL, 'rules', 'ukazka:term'),
               ('blocklist', $2::jsonb, 2, $5::uuid[], 'Celý diktát jste dvakrát smazali.', 'rules', 'ukazka:block'),
               ('rule', $3::jsonb, 4, $6::uuid[], 'V opravách píšete malá čísla slovy.', 'ai', 'ukazka:rule')`,
      params: [
        JSON.stringify({ term: 'Dílkovna', heardAs: ['dilkovna', 'dýlkovna'] }),
        JSON.stringify({ phrase: 'Titulky pro vás připravil', mode: 'alone' }),
        JSON.stringify({ text: 'Čísla do deseti pište slovy.' }),
        ex(3),
        ex(2),
        ex(3),
      ],
    },
    {
      text: `INSERT INTO voice_terms (kind, term, heard_as, source, uses) VALUES ('term', 'Dílkovník', ARRAY['dilkovnik'], 'learned', 7)
             ON CONFLICT DO NOTHING`,
      params: [],
    },
  ]
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  const confirmed = args.includes('--ano')
  const removeOnly = args.includes('--smazat')
  const evenWithRealData = args.includes('--i-s-daty')

  if (!process.env.DATABASE_URL) {
    console.error('Chybí DATABASE_URL v .env.local.')
    process.exit(1)
  }
  let host = '(neznámý host)'
  try {
    host = new URL(process.env.DATABASE_URL).host
  } catch {}
  console.log(`Databáze: ${host}`)

  const sql = neon(process.env.DATABASE_URL)
  const [{ real }] = await sql.query(
    `SELECT count(*)::int AS real FROM voice_dictations WHERE app_bundle_id IS NULL OR app_bundle_id NOT LIKE 'ukazka.%'`,
  )
  if (real > 0 && !removeOnly) {
    console.log(`Pozor: v databázi je ${real} skutečných diktátů (bez značky ukazka.*).`)
    if (!evenWithRealData) {
      console.error('Zastavuji, tohle nemusí být testovací databáze. Pokračovat jde přepínačem --i-s-daty.')
      process.exit(1)
    }
  }

  const today = pragueToday()
  const rows = removeOnly ? [] : buildDictations(today)
  const queries = removeOnly ? cleanupQueries() : seedQueries(rows)
  const what = removeOnly ? 'smazat ukázková data' : `smazat starou ukázku a vložit ${rows.length} diktátů za ${DAYS} dní`

  if (!confirmed) {
    console.log(`Dnešek v Praze: ${today}`)
    console.log(`Chystám se ${what} (${queries.length} příkazů v jedné transakci).`)
    console.log('Nic se nestalo. Spusťte znovu s --ano.')
    return
  }
  await sql.transaction(queries.map((x) => sql.query(x.text, x.params)))
  console.log(`Hotovo: ${what}.`)
  if (!removeOnly) console.log('Otevřete /dashboard/voice. Smazání: node scripts/voice-seed.mjs --smazat --ano')
}

main().catch((e) => {
  console.error('Seed selhal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
