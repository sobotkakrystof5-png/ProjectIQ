#!/usr/bin/env node
/**
 * Most Wispr Flow → ZakazIQ (R-144): poskládá tělo pro POST /api/public/schuzky.
 *
 * Konektor Wispr Flow vydává přepis po kusech (nejvýš 40 000 znaků). Naplánovaná
 * úloha Clauda uloží každý kus do vlastního souboru a tenhle skript je spojí
 * přesně za sebou — model tak přepis neslepuje ručně a nic se mezi kusy
 * neztratí ani nepřibude. Odesílá se curlem (proxy úlohy k němu přidá klíč):
 *
 *   node scripts/wispr-most.mjs --meta meta.json --parts ./casti --out telo.json
 *   curl -sS -X POST https://www.zakaziq.cz/api/public/schuzky \
 *        -H 'Content-Type: application/json' --data-binary @telo.json
 *
 * meta.json: { id, title, start, end, share_link, summary, participants,
 *              transcript_chars }   (to, co vrátil konektor)
 * casti/:    cast-1.txt, cast-2.txt, …  (pořadí podle čísla)
 *
 * Bez závislostí, jen Node.
 */

import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const metaPath = arg('meta')
const partsDir = arg('parts')
const out = arg('out', 'telo.json')
const chunk = Number(arg('chunk', '40000'))

if (!metaPath || !partsDir) {
  console.error('Použití: node scripts/wispr-most.mjs --meta meta.json --parts ./casti [--out telo.json] [--chunk 40000]')
  process.exit(2)
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
const files = fs
  .readdirSync(partsDir)
  .filter((f) => /^cast-\d+\.txt$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))

if (files.length === 0) {
  console.error(`Ve složce ${partsDir} nejsou soubory cast-N.txt.`)
  process.exit(2)
}

const MARKER = /^<<<[^\n]*>>>\s*$/
const TRUNCATED = /^\(\.\.\.truncated, \d+ chars remaining[^)]*\)\s*$/

const parts = files.map((file, index) => {
  let text = fs.readFileSync(path.join(partsDir, file), 'utf8')
  // Kdyby v kusu zůstaly značky konektoru, pryč s nimi (jen celé řádky).
  text = text
    .split('\n')
    .filter((line) => !MARKER.test(line.trim()) && !TRUNCATED.test(line.trim()))
    .join('\n')
  const last = index === files.length - 1
  // Editor rád přidá konec řádku na konec souboru; plný kus má mít přesně `chunk` znaků.
  if (!last && text.length === chunk + 1 && text.endsWith('\n')) text = text.slice(0, -1)
  if (last) text = text.replace(/\n+$/, '')
  return text
})

const transcript = parts.join('')
const declared = typeof meta.transcript_chars === 'number' ? meta.transcript_chars : null

const body = {
  source: 'wispr',
  id: String(meta.id),
  title: meta.title ?? null,
  start: meta.start ?? null,
  end: meta.end ?? null,
  share_link: meta.share_link ?? null,
  participants: Array.isArray(meta.participants) ? meta.participants : [],
  summary: meta.summary ?? null,
  transcript,
  transcript_chars: declared,
}

fs.writeFileSync(out, JSON.stringify(body))

const diff = declared === null ? null : transcript.length - declared
console.log(
  JSON.stringify({
    id: body.id,
    parts: parts.length,
    chars: transcript.length,
    declared,
    complete: diff === null ? null : Math.abs(diff) <= 50,
    out,
  }),
)
