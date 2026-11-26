#!/usr/bin/env node
// ZakazIQ Voice (R-148, VO07): zlatá sada čištění se SKUTEČNÝM modelem.
//
// Projde případy ze zlaté sady (lib/admin/voice/__tests__/golden/), pošle
// přepisy modelu role `fast` (lib/ai/models.ts) a vypíše, kolik výstupů prošlo
// kontrolou (G6–G9), kolik skončilo přepisem bez čištění a kde se výsledek liší
// od očekávání. Přepisy jsou vymyšlené věty ze sady, žádné skutečné diktáty.
//
// Volá Claude a stojí peníze (odhad pod 1 Kč za běh), proto se pouští jen
// s --ano a jen na vyžádání; v `npm test` neběží. Klíč (ANTHROPIC_API_KEY)
// čte z .env.local stejně jako aplikace a nikam ho nevypisuje.
//
//   node scripts/voice-eval.mjs          # jen řekne, co by udělal
//   node scripts/voice-eval.mjs --ano    # skutečný běh

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const TEST = 'lib/admin/voice/__tests__/voice-eval.live.test.ts'

function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function main() {
  const args = process.argv.slice(2)
  loadEnvLocal()
  if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
    console.error('Chybí ANTHROPIC_API_KEY v .env.local (nebo v prostředí). Bez něj čištění neběží.')
    process.exit(1)
  }
  if (!args.includes('--ano')) {
    console.log('Zlatá sada čištění se skutečným modelem (stojí to pod 1 Kč).')
    console.log(`Spustí se: npx vitest run ${TEST} s VOICE_EVAL=1.`)
    console.log('Pro skutečný běh přidej --ano.')
    return
  }

  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voice-eval-')), 'vysledek.json')
  const res = spawnSync('npx', ['vitest', 'run', TEST], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VOICE_EVAL: '1', VOICE_EVAL_OUT: out },
  })
  if (!fs.existsSync(out)) {
    console.error('Běh nedoběhl, výsledek chybí.')
    process.exit(res.status ?? 1)
  }
  const rows = JSON.parse(fs.readFileSync(out, 'utf8'))
  fs.rmSync(path.dirname(out), { recursive: true, force: true })

  const ok = rows.filter((r) => r.stav === 'ok')
  const raw = rows.filter((r) => r.stav === 'raw')
  const match = rows.filter((r) => r.shoda)
  const withExpected = rows.filter((r) => !r.ocekavano.startsWith('('))
  const ms = rows.map((r) => r.ms).filter((v) => typeof v === 'number').sort((a, b) => a - b)
  const p = (q) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] : null)
  const cost = rows.reduce((s, r) => s + r.costUsd, 0)

  console.log('\n=== Výsledek ===')
  console.log(`Případů: ${rows.length}`)
  console.log(`Prošlo kontrolou (ok): ${ok.length}`)
  console.log(`Přepis bez čištění (raw): ${raw.length}`)
  console.log(`Přesná shoda s očekávaným textem: ${match.length} z ${withExpected.length}`)
  console.log(`Čas čištění p50 / p95: ${p(0.5) ?? '?'} ms / ${p(0.95) ?? '?'} ms`)
  console.log(`Náklad běhu (přepis podle ceníku + čištění): ${cost.toFixed(5)} USD`)

  if (raw.length) {
    console.log('\n--- Skončilo raw (pojistka nebo chyba) ---')
    for (const r of raw) {
      console.log(`• ${r.file} · ${r.nazev} [${r.pojistky.filter((g) => g !== 'segments').join(', ')}]`)
    }
  }
  const differs = ok.filter((r) => !r.shoda)
  if (differs.length) {
    console.log('\n--- Prošlo, ale liší se od očekávání (k posouzení okem) ---')
    for (const r of differs) {
      console.log(`• ${r.file} · ${r.nazev} (${r.styl})`)
      console.log(`    přepis:     ${r.prepis}`)
      console.log(`    očekáváno:  ${r.ocekavano}`)
      console.log(`    výsledek:   ${r.vysledek}`)
    }
  }
  process.exit(res.status ?? 0)
}

main()
