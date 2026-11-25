#!/usr/bin/env node
/**
 * Most Wispr Flow → ZakazIQ z Macu (R-144).
 *
 * Desktopová aplikace Wispr Flow si drží celé přepisy schůzek i na Macu:
 *   ~/Library/Application Support/Wispr Flow/flow.sqlite        (tabulka Meetings)
 *   ~/Library/Application Support/Wispr Flow/meetings/<id>/refined.ndjson  (přepis po segmentech)
 * Tenhle skript je čte přímo — bez modelu, takže přepis dorazí slovo od slova
 * (dřívější cesta přes naplánovanou úlohu Clauda selhala: model nesmí dlouhý
 * text doslova opsat). Pošle jen schůzky, které ZakazIQ ještě nemá.
 *
 *   node scripts/wispr-local-most.mjs --dry-run     ukáže, co by poslal (bez obsahu)
 *   node scripts/wispr-local-most.mjs               pošle nové schůzky (posledních 30 dní)
 *   node scripts/wispr-local-most.mjs --days 90     delší okno
 *   node scripts/wispr-local-most.mjs --only <id>,<id>
 *   node scripts/wispr-local-most.mjs --install     zkopíruje se mimo repo a zapne LaunchAgent (každou hodinu)
 *   node scripts/wispr-local-most.mjs --uninstall   LaunchAgent vypne a smaže
 *
 * Klíč `MEETING_NOTES_API_KEY` čte z Klíčenky (služba `zakaziq-meeting-notes`),
 * nikdy ze souboru ani z argumentů. Bez závislostí, jen Node a systémové
 * `sqlite3` a `security`. Obsah schůzek do výstupu nepíše.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const WISPR_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Wispr Flow')
export const API_URL = 'https://www.zakaziq.cz/api/public/schuzky'
export const KEYCHAIN_SERVICE = 'zakaziq-meeting-notes'
export const LABEL = 'cz.zakaziq.wispr-most'
const INSTALL_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'ZakazIQ')
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG = path.join(os.homedir(), 'Library', 'Logs', 'zakaziq-wispr-most.log')

/** Kratší nahrávky a skoro prázdné přepisy (pokus o spojení, ticho) se neposílají. */
export const MIN_RECORDED_MS = 60_000
export const MIN_TRANSCRIPT_CHARS = 300
const MAX_TRANSCRIPT_CHARS = 1_000_000

/**
 * Jméno mluvčího z `speakerMap` Wispr Flow: přednost má to, co přiřadil
 * uživatel, pak mikrofon, kalendář a nakonec odhad AI. Bez jména „Speaker N"
 * (stejně jako konektor Wispr Flow).
 */
export function speakerLabel(speakerId, speakerMap) {
  const fallback = `Speaker ${speakerId}`
  if (!speakerMap || typeof speakerMap !== 'object') return fallback
  const assignment = speakerMap.assignments?.[String(speakerId)]
  if (!assignment) return fallback
  for (const source of ['user', 'mic', 'dom', 'llm']) {
    const key = assignment[source]
    const name = key ? speakerMap.people?.[key]?.name : null
    if (typeof name === 'string' && name.trim()) return name.trim().replace(/[:\n\r]+/g, ' ')
  }
  return fallback
}

/** Přepis z řádků `refined.ndjson`: jeden segment = jeden řádek „Mluvčí: text". Text se nemění. */
export function buildTranscript(segments, speakerMap) {
  return segments
    .filter((s) => typeof s?.text === 'string' && s.text.length > 0)
    .map((s) => `${speakerLabel(s.speaker?.id ?? '?', speakerMap)}: ${s.text}`)
    .join('\n')
}

export function parseNdjson(raw) {
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

/** `2026-11-04 15:01:30.364 +00:00` (Sequelize) → ISO s časovou zónou. */
export function sqliteDateToIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) return null
  const zone = !m[3] || m[3] === 'Z' ? 'Z' : m[3].includes(':') ? m[3] : `${m[3].slice(0, 3)}:${m[3].slice(3)}`
  const d = new Date(`${m[1]}T${m[2]}${zone}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function msToIso(value) {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  return new Date(n).toISOString()
}

function parseJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Účastníci = pojmenovaní mluvčí ze `speakerMap` (e-maily lokálně nejsou). */
export function participantsFrom(speakerMap) {
  const people = speakerMap?.people
  if (!people || typeof people !== 'object') return []
  const seen = new Set()
  const out = []
  for (const person of Object.values(people)) {
    const name = typeof person?.name === 'string' ? person.name.trim() : ''
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ name: name.slice(0, 200), emails: [], spoke: true })
    if (out.length >= 50) break
  }
  return out
}

/** Tělo pro `POST /api/public/schuzky` z řádku tabulky Meetings a hotového přepisu. */
export function buildPayload(row, transcript) {
  const speakerMap = parseJson(row.speakerMap)
  const start = msToIso(row.calendarOccurrenceStartAtUtc) ?? sqliteDateToIso(row.createdAt)
  const end = msToIso(row.endedAt)
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim().slice(0, 300) : null
  const summary = typeof row.summary === 'string' && row.summary.trim() ? row.summary.slice(0, 20_000) : null
  const slug = typeof row.shareSlug === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(row.shareSlug) ? row.shareSlug : null
  return {
    source: 'wispr',
    id: String(row.id),
    title,
    start,
    end,
    share_link: slug ? `https://notes.wisprflow.ai/shared/${slug}` : null,
    participants: participantsFrom(speakerMap),
    summary,
    transcript,
    // Přepis se čte lokálně celý, takže délka je přesná.
    transcript_chars: transcript.length,
  }
}

/** Je schůzka hotová a stojí za poslání? */
export function isEligible(row) {
  return (
    Number(row.finalized) === 1 &&
    Number(row.isDeleted) !== 1 &&
    Number(row.transcriptReady) === 1 &&
    Number(row.contentWithheld) !== 1 &&
    !row.transcriptDeletedAt &&
    Number(row.recordedMs) >= MIN_RECORDED_MS
  )
}

function readMeetingRows(days, only) {
  const db = path.join(WISPR_DIR, 'flow.sqlite')
  if (!fs.existsSync(db)) throw new Error(`Databáze Wispr Flow nenalezena: ${db}`)
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const ids = only.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  const where = ids.length > 0 ? `id IN (${ids.map((id) => `'${id}'`).join(',')})` : `createdAt >= '${since}'`
  const sql = `SELECT id, title, createdAt, endedAt, calendarOccurrenceStartAtUtc, recordedMs, finalized,
                      isDeleted, transcriptReady, contentWithheld, transcriptDeletedAt, shareSlug, speakerMap, summary
                 FROM Meetings WHERE ${where} ORDER BY createdAt`
  const out = execFileSync('/usr/bin/sqlite3', ['-readonly', '-json', `file:${db}?mode=ro`, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.trim() ? JSON.parse(out) : []
}

function readTranscript(row) {
  const file = path.join(WISPR_DIR, 'meetings', row.id, 'refined.ndjson')
  if (!fs.existsSync(file)) return null
  return buildTranscript(parseNdjson(fs.readFileSync(file, 'utf8')), parseJson(row.speakerMap))
}

function readKey() {
  try {
    return execFileSync('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    throw new Error(`V Klíčence chybí klíč (služba „${KEYCHAIN_SERVICE}").`)
  }
}

async function knownIds(ids, key) {
  const known = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const res = await fetch(`${API_URL}?ids=${batch.map(encodeURIComponent).join(',')}`, {
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.success) throw new Error(`ZakazIQ GET ${res.status}: ${body?.error ?? 'neznámá chyba'}`)
    for (const id of body.known ?? []) known.add(id)
  }
  return known
}

async function send(payload, key) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'error',
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

function arg(argv, name, fallback = null) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export async function run(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run')
  const days = Math.min(Math.max(Number(arg(argv, 'days', '30')) || 30, 1), 3650)
  const only = (arg(argv, 'only', '') ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  const rows = readMeetingRows(days, only)
  const candidates = []
  let skipped = 0
  for (const row of rows) {
    if (!isEligible(row)) {
      skipped++
      continue
    }
    const transcript = readTranscript(row)
    if (!transcript || transcript.length < MIN_TRANSCRIPT_CHARS || transcript.length > MAX_TRANSCRIPT_CHARS) {
      skipped++
      continue
    }
    candidates.push({ row, transcript })
  }

  if (dryRun) {
    console.log(`[${stamp()}] suchý běh: ${candidates.length} k odeslání, ${skipped} vynecháno (posledních ${days} dní)`)
    for (const { row, transcript } of candidates) {
      const p = buildPayload(row, transcript)
      console.log(`  ${row.id}  ${p.start ?? '?'}  znaků ${transcript.length}  mluvčích ${new Set(transcript.split('\n').map((l) => l.split(':')[0])).size}  odkaz ${p.share_link ? 'ano' : 'ne'}  shrnutí ${p.summary ? 'ano' : 'ne'}`)
    }
    return 0
  }

  if (candidates.length === 0) {
    console.log(`[${stamp()}] nové schůzky: 0 (vynecháno ${skipped})`)
    return 0
  }

  const key = readKey()
  const known = await knownIds(candidates.map((c) => c.row.id), key)
  const fresh = candidates.filter((c) => !known.has(c.row.id))
  let sent = 0
  let failed = 0
  for (const { row, transcript } of fresh) {
    const { status, body } = await send(buildPayload(row, transcript), key)
    if (status === 200 || status === 201) {
      sent++
      console.log(`[${stamp()}] odesláno ${row.id} (${status}, znaků ${body?.chars ?? '?'}, complete ${body?.complete})`)
    } else {
      failed++
      console.log(`[${stamp()}] CHYBA ${row.id}: ${status} ${body?.error ?? ''}`)
    }
  }
  console.log(`[${stamp()}] nové schůzky: ${fresh.length}, odesláno ${sent}, chyby ${failed}, už v ZakazIQ ${known.size}, vynecháno ${skipped}`)
  return failed > 0 ? 1 : 0
}

function xml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function install() {
  readKey() // bez klíče nemá smysl nic zapínat
  fs.mkdirSync(INSTALL_DIR, { recursive: true })
  const target = path.join(INSTALL_DIR, 'wispr-local-most.mjs')
  fs.copyFileSync(fileURLToPath(import.meta.url), target)
  fs.mkdirSync(path.dirname(PLIST), { recursive: true })
  fs.mkdirSync(path.dirname(LOG), { recursive: true })
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(target)}</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
</dict>
</plist>
`
  fs.writeFileSync(PLIST, plist)
  const domain = `gui/${process.getuid()}`
  try {
    execFileSync('/bin/launchctl', ['bootout', `${domain}/${LABEL}`], { stdio: 'ignore' })
  } catch {
    // nebyl zapnutý
  }
  execFileSync('/bin/launchctl', ['bootstrap', domain, PLIST])
  console.log(`Zapnuto: ${LABEL} každou hodinu (skript ${target}, záznam ${LOG}).`)
}

function uninstall() {
  try {
    execFileSync('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' })
  } catch {
    // nebyl zapnutý
  }
  fs.rmSync(PLIST, { force: true })
  console.log(`Vypnuto: ${LABEL}.`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
if (isMain) {
  const argv = process.argv.slice(2)
  try {
    if (argv.includes('--install')) install()
    else if (argv.includes('--uninstall')) uninstall()
    else process.exitCode = await run(argv)
  } catch (err) {
    console.error(`[${stamp()}] ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}
