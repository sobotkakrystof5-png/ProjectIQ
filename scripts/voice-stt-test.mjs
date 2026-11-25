#!/usr/bin/env node
// Test přepisu češtiny pro ZakazIQ Voice (VO00, plán docs/admin/VOICE-PLAN.md → D-V3).
//
// Pro každou nahrávku ve složce zavolá Groq whisper-large-v3-turbo, Groq
// whisper-large-v3 a OpenAI (model z env), změří čas odpovědi a spočítá
// chybovost slov (WER) proti tomu, co se opravdu řeklo.
//
//   node scripts/voice-stt-test.mjs ~/ZakazIQ-voice-test
//   node scripts/voice-stt-test.mjs ~/ZakazIQ-voice-test --napoveda "ZakazIQ, Prvotka, VIZEON"
//   node scripts/voice-stt-test.mjs ~/ZakazIQ-voice-test --jen groq-turbo,openai --podrobne
//   node scripts/voice-stt-test.mjs --selftest
//
// Ve složce: nahrávky *.m4a (nebo .wav, .mp3) a ke každé stejnojmenný *.txt
// s tím, co se řeklo. Prázdný .txt = ticho (ukáže, který přepis si vymýšlí).
//
// Nahrávky jsou hlas Kryštofa: patří mimo repo (~/ZakazIQ-voice-test/), skript
// je nikam neukládá ani nekopíruje. Klíče čte z .env.local stejně jako
// scripts/apply-migration.js a nikdy je nevypisuje. Bez cizích balíčků
// (fetch, FormData a Blob jsou v Node 24).

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// Ceny ověřené 2026-11-25 (docs/admin/VOICE-PLAN.md, oddíl 12).
// Groq: console.groq.com/docs/speech-to-text, nejkratší účtovaná délka 10 s.
// OpenAI: developers.openai.com/api/docs/pricing, „Estimated cost" za minutu.
const PRICES = {
  'groq-turbo': { perMinuteUsd: 0.04 / 60, minBilledSec: 10 },
  'groq-v3': { perMinuteUsd: 0.111 / 60, minBilledSec: 10 },
  openai: {
    // Odhad podle modelu; neznámý model = cena gpt-4o-transcribe.
    perMinuteUsd: (model) => (/mini/.test(model) ? 0.003 : 0.006),
    minBilledSec: 0,
  },
}

// Pojistka G2 z plánu (oddíl 4): segment, který se zahodí.
const G2 = { noSpeechProb: 0.6, avgLogprob: -1, compressionRatio: 2.4 }

const AUDIO_EXT = new Map([
  ['.m4a', 'audio/mp4'],
  ['.mp4', 'audio/mp4'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
])

// ---------------------------------------------------------------------------
// Pomocné funkce (testuje je --selftest)

/** Malá písmena, bez interpunkce, slova oddělená mezerou. Diakritika zůstává. */
export function normalizeWords(text) {
  return String(text ?? '')
    .toLocaleLowerCase('cs')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Levenshtein nad slovy. */
export function wordEditDistance(ref, hyp) {
  const prev = new Array(hyp.length + 1)
  for (let j = 0; j <= hyp.length; j++) prev[j] = j
  for (let i = 1; i <= ref.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= hyp.length; j++) {
      const up = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (ref[i - 1] === hyp[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[hyp.length]
}

/**
 * WER = úpravy / slova reference. U ticha (prázdná reference) je to počet
 * vymyšlených slov, takže 0 = správně nic, cokoli víc = halucinace.
 */
export function wer(reference, hypothesis) {
  const ref = normalizeWords(reference)
  const hyp = normalizeWords(hypothesis)
  if (ref.length === 0) return hyp.length
  return wordEditDistance(ref, hyp) / ref.length
}

export function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/** Text Groq odpovědi po zahození segmentů podle G2. */
export function applyG2(segments) {
  if (!Array.isArray(segments)) return { text: null, dropped: 0 }
  let dropped = 0
  const kept = []
  for (const s of segments) {
    const silent = s.no_speech_prob > G2.noSpeechProb && s.avg_logprob < G2.avgLogprob
    const looping = s.compression_ratio > G2.compressionRatio
    if (silent || looping) dropped++
    else kept.push(String(s.text ?? '').trim())
  }
  return { text: kept.join(' ').trim(), dropped }
}

export function costUsd(provider, model, durationSec) {
  const price = PRICES[provider]
  if (!price || !(durationSec > 0)) return null
  const perMinute = typeof price.perMinuteUsd === 'function' ? price.perMinuteUsd(model) : price.perMinuteUsd
  return (Math.max(durationSec, price.minBilledSec) / 60) * perMinute
}

// ---------------------------------------------------------------------------
// Prostředí a vstupy

function loadEnvLocal() {
  const file = path.join(HERE, '..', '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function argValue(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1] ?? null
}

function audioDurationSec(file) {
  // afinfo je na každém Macu; jinde se délka vezme z odpovědi Groq.
  const out = spawnSync('afinfo', [file], { encoding: 'utf8' })
  const m = out.status === 0 ? out.stdout.match(/estimated duration:\s*([\d.]+)/) : null
  return m ? Number(m[1]) : null
}

function listSamples(dir) {
  const samples = []
  for (const name of fs.readdirSync(dir).sort()) {
    const ext = path.extname(name).toLowerCase()
    if (!AUDIO_EXT.has(ext)) continue
    const base = name.slice(0, -ext.length)
    const txt = path.join(dir, `${base}.txt`)
    if (!fs.existsSync(txt)) {
      console.warn(`  ${name}: chybí ${base}.txt, přeskakuji`)
      continue
    }
    samples.push({
      name,
      file: path.join(dir, name),
      mime: AUDIO_EXT.get(ext),
      reference: fs.readFileSync(txt, 'utf8').trim(),
    })
  }
  return samples
}

// ---------------------------------------------------------------------------
// Volání poskytovatelů

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function postWithRetry(url, key, buildForm) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const started = performance.now()
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: buildForm(),
      signal: AbortSignal.timeout(60_000),
    })
    const ms = performance.now() - started
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after')) || 5
      console.warn(`    limit požadavků, čekám ${wait} s`)
      await sleep(wait * 1000)
      continue
    }
    const body = await res.text()
    if (!res.ok) {
      // Tělo chyby nenese klíč, jen popis; zkrátit, ať nezaplní terminál.
      throw new Error(`HTTP ${res.status}: ${body.replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    return { json: JSON.parse(body), ms }
  }
  throw new Error('HTTP 429 opakovaně')
}

function makeProviders(hint) {
  const groqKey = process.env.GROQ_API_KEY?.trim()
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const openaiModel =
    process.env.VOICE_OPENAI_STT_MODEL?.trim() || process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-transcribe'

  const groq = (id, model) => ({
    id,
    model,
    key: groqKey,
    missing: 'GROQ_API_KEY',
    async run(sample, audio) {
      const { json, ms } = await postWithRetry('https://api.groq.com/openai/v1/audio/transcriptions', groqKey, () => {
        const form = new FormData()
        form.append('file', new Blob([audio], { type: sample.mime }), sample.name)
        form.append('model', model)
        form.append('language', 'cs')
        form.append('response_format', 'verbose_json')
        form.append('temperature', '0')
        if (hint) form.append('prompt', hint)
        return form
      })
      const g2 = applyG2(json.segments)
      return { text: String(json.text ?? '').trim(), ms, duration: json.duration ?? null, g2 }
    },
  })

  return [
    groq('groq-turbo', 'whisper-large-v3-turbo'),
    groq('groq-v3', 'whisper-large-v3'),
    {
      id: 'openai',
      model: openaiModel,
      key: openaiKey,
      missing: 'OPENAI_API_KEY',
      async run(sample, audio) {
        const { json, ms } = await postWithRetry('https://api.openai.com/v1/audio/transcriptions', openaiKey, () => {
          const form = new FormData()
          form.append('file', new Blob([audio], { type: sample.mime }), sample.name)
          form.append('model', openaiModel)
          form.append('language', 'cs')
          form.append('response_format', 'json')
          if (hint) form.append('prompt', hint)
          return form
        })
        return { text: String(json.text ?? '').trim(), ms, duration: null, g2: null }
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Výpis

const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`)
const fmtMs = (v) => (v == null ? '—' : `${Math.round(v)} ms`)

function pad(s, n) {
  s = String(s)
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

function printTable(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)))
  for (const [i, r] of rows.entries()) {
    console.log(r.map((cell, c) => pad(cell, widths[c])).join('  '))
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) return selftest()

  const dir = args.find((a, i) => !a.startsWith('--') && !['--jen', '--napoveda'].includes(args[i - 1]))
  if (!dir) {
    console.error('Použití: node scripts/voice-stt-test.mjs <složka s nahrávkami> [--jen groq-turbo,groq-v3,openai] [--napoveda "…"] [--podrobne]')
    process.exit(1)
  }
  const folder = path.resolve(dir.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'))
  if (!fs.existsSync(folder)) {
    console.error(`Složka ${folder} neexistuje.`)
    process.exit(1)
  }

  loadEnvLocal()
  const hint = argValue(args, '--napoveda')
  const only = argValue(args, '--jen')?.split(',').map((s) => s.trim())
  const verbose = args.includes('--podrobne')

  const providers = makeProviders(hint).filter((p) => !only || only.includes(p.id))
  for (const p of providers) if (!p.key) console.warn(`${p.id}: chybí ${p.missing}, přeskakuji`)
  const active = providers.filter((p) => p.key)
  if (active.length === 0) {
    console.error('Žádný poskytovatel nemá klíč v .env.local.')
    process.exit(1)
  }

  const samples = listSamples(folder)
  if (samples.length === 0) {
    console.error('Ve složce nejsou nahrávky s textem (.m4a + .txt).')
    process.exit(1)
  }
  console.log(`Nahrávek: ${samples.length}, poskytovatelé: ${active.map((p) => `${p.id} (${p.model})`).join(', ')}`)
  if (hint) console.log(`Nápověda přepisu: ${hint.length} znaků`)

  const results = new Map(active.map((p) => [p.id, []]))

  for (const sample of samples) {
    const audio = fs.readFileSync(sample.file)
    let duration = audioDurationSec(sample.file)
    console.log(`\n${sample.name}${sample.reference ? '' : '  (ticho)'}${duration ? `  ${duration.toFixed(1)} s` : ''}`)
    for (const p of active) {
      try {
        const r = await p.run(sample, audio)
        duration ??= r.duration
        const row = {
          sample: sample.name,
          silence: sample.reference === '',
          wer: wer(sample.reference, r.text),
          werG2: r.g2?.text != null ? wer(sample.reference, r.g2.text) : null,
          g2Dropped: r.g2?.dropped ?? null,
          ms: r.ms,
          cost: costUsd(p.id, p.model, duration),
        }
        results.get(p.id).push(row)
        const silenceNote = row.silence ? `vymyšlených slov ${row.wer}` : `WER ${fmtPct(row.wer)}`
        const g2Note = row.g2Dropped ? `, G2 zahodila ${row.g2Dropped} seg. → ${row.silence ? row.werG2 : fmtPct(row.werG2)}` : ''
        console.log(`  ${pad(p.id, 11)} ${silenceNote}, ${fmtMs(r.ms)}${g2Note}`)
        if (verbose) console.log(`    „${r.text}“`)
      } catch (err) {
        results.get(p.id).push({ sample: sample.name, error: true })
        console.log(`  ${pad(p.id, 11)} chyba: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  console.log('\nSouhrn (WER bez nahrávek ticha; ticho = vymyšlená slova na prázdné nahrávce)\n')
  const rows = [['poskytovatel', 'model', 'WER průměr', 'WER nejhorší', 'ticho', 'ticho po G2', 'p50', 'p95', 'chyby', 'cena celkem']]
  for (const p of active) {
    const all = results.get(p.id)
    const ok = all.filter((r) => !r.error)
    const speech = ok.filter((r) => !r.silence)
    const silence = ok.filter((r) => r.silence)
    const avg = speech.length ? speech.reduce((s, r) => s + r.wer, 0) / speech.length : null
    const worst = speech.length ? Math.max(...speech.map((r) => r.wer)) : null
    const cost = ok.reduce((s, r) => s + (r.cost ?? 0), 0)
    rows.push([
      p.id,
      p.model,
      fmtPct(avg),
      fmtPct(worst),
      silence.length ? silence.map((r) => r.wer).join('/') : '—',
      silence.length && silence.some((r) => r.werG2 != null) ? silence.map((r) => r.werG2 ?? '—').join('/') : '—',
      fmtMs(percentile(ok.map((r) => r.ms), 50)),
      fmtMs(percentile(ok.map((r) => r.ms), 95)),
      all.length - ok.length,
      `$${cost.toFixed(5)}`,
    ])
  }
  printTable(rows)
  console.log('\nČasy měří celou cestu z tohoto počítače, ne z Vercelu (fra1). Cena = odhad z ceníku v hlavičce skriptu.')
}

function selftest() {
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`selftest: ${msg}`)
      process.exit(1)
    }
  }
  assert(normalizeWords('Ahoj, Petře!  Jak se máš?').join(' ') === 'ahoj petře jak se máš', 'normalizace')
  assert(normalizeWords('ZakazIQ 2026-11-25').join(' ') === 'zakaziq 2026 11 25', 'čísla')
  assert(wer('jedna dva tři', 'jedna dva tři') === 0, 'shoda')
  assert(Math.abs(wer('jedna dva tři čtyři', 'jedna tři čtyři pět') - 0.5) < 1e-9, 'WER 2/4')
  assert(wer('', 'Titulky vytvořil') === 2, 'ticho počítá vymyšlená slova')
  assert(wer('', '') === 0, 'ticho bez slov')
  assert(percentile([5, 1, 3, 2, 4], 50) === 3 && percentile([1, 2, 3, 4, 100], 95) === 100, 'percentil')
  const g2 = applyG2([
    { text: ' Dobrý den.', no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.1 },
    { text: ' Titulky vytvořil', no_speech_prob: 0.9, avg_logprob: -1.4, compression_ratio: 1.0 },
    { text: ' a a a a a a a a', no_speech_prob: 0.1, avg_logprob: -0.3, compression_ratio: 3.1 },
  ])
  assert(g2.text === 'Dobrý den.' && g2.dropped === 2, 'G2')
  assert(Math.abs(costUsd('groq-turbo', 'whisper-large-v3-turbo', 3) - (10 / 60) * (0.04 / 60)) < 1e-12, 'nejkratší účtovaná délka')
  assert(Math.abs(costUsd('openai', 'gpt-4o-mini-transcribe', 60) - 0.003) < 1e-12, 'cena OpenAI mini')
  console.log('selftest: v pořádku')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
