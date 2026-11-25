#!/usr/bin/env node
/**
 * Most Wispr Flow → ZakazIQ z Macu (R-144).
 *
 * Desktopová aplikace Wispr Flow si drží celé přepisy schůzek i na Macu:
 *   ~/Library/Application Support/Wispr Flow/flow.sqlite        (tabulka Meetings)
 *   ~/Library/Application Support/Wispr Flow/meetings/<id>/refined.ndjson  (přepis po segmentech)
 * Tenhle skript je čte přímo — bez modelu, takže přepis dorazí slovo od slova
 * (dřívější cesta přes naplánovanou úlohu Clauda selhala: model nesmí dlouhý
 * text doslova opsat).
 *
 * Běží každých 5 minut. Co už odeslal, si pamatuje v souboru stavu (otisk
 * obsahu), takže na server jde jen nová schůzka nebo schůzka, kterou Wispr Flow
 * po skončení ještě přepočítal (jiný přepis, název, jména mluvčích). Server
 * stejnou schůzku podle id nezdvojí.
 *
 *   node scripts/wispr-local-most.mjs --dry-run     ukáže, co by poslal a co vynechal (bez obsahu)
 *   node scripts/wispr-local-most.mjs               pošle nové a změněné schůzky (posledních 30 dní)
 *   node scripts/wispr-local-most.mjs --days 90     delší okno
 *   node scripts/wispr-local-most.mjs --only <id>,<id>   pošle tyhle znovu, i když se nezměnily
 *   node scripts/wispr-local-most.mjs --install     zkopíruje se mimo repo a zapne LaunchAgent (každých 5 minut)
 *   node scripts/wispr-local-most.mjs --uninstall   LaunchAgent vypne a smaže
 *
 * Klíč `MEETING_NOTES_API_KEY` čte z Klíčenky (služba `zakaziq-meeting-notes`),
 * nikdy ze souboru ani z argumentů. Bez závislostí, jen Node a systémové
 * `sqlite3` a `security`. Obsah schůzek do výstupu ani do souboru stavu nepíše.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const WISPR_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Wispr Flow')
export const API_URL = 'https://www.zakaziq.cz/api/public/schuzky'
export const KEYCHAIN_SERVICE = 'zakaziq-meeting-notes'
export const LABEL = 'cz.zakaziq.wispr-most'
/** Jak často LaunchAgent most pouští. Schůzka je v ZakazIQ nejpozději 5 minut po skončení. */
export const INTERVAL_SECONDS = 300
/** Řádek „běží, nic nového" do záznamu nejvýš jednou za hodinu, ať záznam nebobtná. */
const HEARTBEAT_MS = 55 * 60_000
const INSTALL_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'ZakazIQ')
const STATE_FILE = path.join(INSTALL_DIR, 'wispr-most-stav.json')
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

/**
 * Proč se schůzka neposílá, nebo `null`, když je hotová a stojí za poslání.
 * „probiha" = Wispr Flow ji ještě nahrává nebo dopočítává přepis; pošle se
 * při dalším běhu po dokončení.
 */
export function skipReason(row) {
  if (Number(row.isDeleted) === 1 || row.transcriptDeletedAt) return 'smazana'
  if (Number(row.contentWithheld) === 1) return 'skryta'
  if (Number(row.finalized) !== 1 || Number(row.transcriptReady) !== 1) return 'probiha'
  if (!(Number(row.recordedMs) >= MIN_RECORDED_MS)) return 'kratka'
  return null
}

/** Je schůzka hotová a stojí za poslání? */
export function isEligible(row) {
  return skipReason(row) === null
}

/**
 * Otisk toho, co se posílá. Změní se, když Wispr Flow po schůzce přepočítá
 * přepis, doplní název, shrnutí nebo jména mluvčích — pak se schůzka pošle znovu.
 */
export function payloadHash(payload) {
  const { title, start, end, share_link, participants, summary, transcript } = payload
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ title, start, end, share_link, participants, summary, transcript }))
    .digest('hex')
}

/** Soubor stavu: `{ sent: { <id>: <otisk> }, heartbeatAt }`. Poškozený nebo chybějící = prázdný. */
export function parseState(raw) {
  const empty = { sent: {}, heartbeatAt: 0 }
  if (typeof raw !== 'string' || !raw.trim()) return empty
  try {
    const value = JSON.parse(raw)
    const sent = value && typeof value.sent === 'object' && value.sent !== null ? value.sent : {}
    const clean = {}
    for (const [id, hash] of Object.entries(sent)) {
      if (typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)) clean[id] = hash
    }
    return { sent: clean, heartbeatAt: Number(value?.heartbeatAt) || 0 }
  } catch {
    return empty
  }
}

/** Co poslat: nové (`new`) a změněné (`changed`); `force` pošle i nezměněné. */
export function planSends(items, state, force = false) {
  const out = []
  for (const item of items) {
    const known = state.sent[item.id]
    if (known === undefined) out.push({ ...item, kind: 'new' })
    else if (known !== item.hash) out.push({ ...item, kind: 'changed' })
    else if (force) out.push({ ...item, kind: 'forced' })
  }
  return out
}

function readState() {
  try {
    return parseState(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return parseState('')
  }
}

function writeState(state) {
  fs.mkdirSync(INSTALL_DIR, { recursive: true })
  const tmp = `${STATE_FILE}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 })
  fs.renameSync(tmp, STATE_FILE)
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
  const items = []
  const skipped = { probiha: 0, kratka: 0, smazana: 0, skryta: 0, prazdna: 0 }
  const skippedRows = []
  for (const row of rows) {
    let reason = skipReason(row)
    let transcript = null
    if (reason === null) {
      transcript = readTranscript(row)
      if (!transcript || transcript.length < MIN_TRANSCRIPT_CHARS || transcript.length > MAX_TRANSCRIPT_CHARS) reason = 'prazdna'
    }
    if (reason !== null) {
      skipped[reason]++
      skippedRows.push({ id: row.id, reason })
      continue
    }
    const payload = buildPayload(row, transcript)
    items.push({ id: String(row.id), payload, hash: payloadHash(payload) })
  }

  const state = readState()
  const plan = planSends(items, state, only.length > 0)
  const skippedText = Object.entries(skipped)
    .filter(([, n]) => n > 0)
    .map(([why, n]) => `${{ probiha: 'probíhá', kratka: 'krátká', smazana: 'smazaná', skryta: 'skrytá', prazdna: 'bez přepisu' }[why]} ${n}`)
    .join(', ')

  if (dryRun) {
    console.log(`[${stamp()}] suchý běh (posledních ${days} dní): k odeslání ${plan.length}, beze změny ${items.length - plan.length}, vynecháno ${skippedRows.length}${skippedText ? ` (${skippedText})` : ''}`)
    for (const { id, payload, kind } of plan) {
      const t = payload.transcript
      console.log(`  ${kind === 'new' ? 'nová   ' : kind === 'changed' ? 'změněná' : 'znovu  '}  ${id}  ${payload.start ?? '?'}  znaků ${t.length}  mluvčích ${new Set(t.split('\n').map((l) => l.split(':')[0])).size}  odkaz ${payload.share_link ? 'ano' : 'ne'}  shrnutí ${payload.summary ? 'ano' : 'ne'}`)
    }
    for (const { id, reason } of skippedRows) console.log(`  vynechá  ${id}  ${reason}`)
    return 0
  }

  const now = Date.now()
  if (plan.length === 0) {
    // Nic nového: do záznamu jen jednou za hodinu, ať je vidět, že most žije.
    if (now - state.heartbeatAt >= HEARTBEAT_MS) {
      console.log(`[${stamp()}] běží, nic nového (v ZakazIQ ${items.length}${skippedText ? `, vynecháno: ${skippedText}` : ''})`)
      writeState({ ...state, heartbeatAt: now })
    }
    return 0
  }

  const key = readKey()
  let sent = 0
  let failed = 0
  for (const { id, payload, hash, kind } of plan) {
    const { status, body } = await send(payload, key)
    if (status === 200 || status === 201) {
      sent++
      state.sent[id] = hash
      writeState(state)
      const what = status === 201 ? 'nová' : body?.changed ? 'aktualizovaná' : 'beze změny'
      console.log(`[${stamp()}] odesláno ${id} (${what}${kind === 'changed' ? ', Wispr ji přepočítal' : ''}, znaků ${body?.chars ?? '?'}, celé ${body?.complete ? 'ano' : 'NE'})`)
    } else {
      failed++
      console.log(`[${stamp()}] CHYBA ${id}: ${status} ${body?.error ?? ''}`)
    }
  }
  writeState({ ...state, heartbeatAt: now })
  console.log(`[${stamp()}] odesláno ${sent}, chyby ${failed}${skippedText ? `, vynecháno: ${skippedText}` : ''}`)
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
  <key>StartInterval</key><integer>${INTERVAL_SECONDS}</integer>
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
  console.log(`Zapnuto: ${LABEL} každých ${INTERVAL_SECONDS / 60} minut (skript ${target}, záznam ${LOG}).`)
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
