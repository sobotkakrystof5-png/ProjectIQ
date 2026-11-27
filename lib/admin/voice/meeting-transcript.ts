import { foldText, words } from './text'

/**
 * ZakazIQ Voice — schůzky (R-151): z promluv dvou stop jeden přepis rozhovoru.
 *
 * Stopa `me` je mikrofon (Kryštof), `other` zvuk počítače (druhá strana).
 * Promluvy se seřadí podle začátku, po sobě jdoucí promluvy téhož mluvčího
 * se spojí do jednoho odstavce. Čistá logika bez databáze, testuje se zvlášť.
 *
 * Ozvěna: bez sluchátek slyší mikrofon i druhou stranu z reproduktorů, takže
 * její slova přijdou dvakrát. Promluva z mikrofonu, která se časem kryje
 * s promluvou druhé strany a má skoro stejná slova, se do přepisu nedá
 * (v databázi zůstane, jen se neukáže).
 */

export type MeetingTrack = 'me' | 'other'

export interface MeetingTurnRow {
  track: MeetingTrack
  idx: number
  startMs: number
  durationMs: number
  status: string
  text: string | null
}

export interface TranscriptBlock {
  speaker: MeetingTrack
  startMs: number
  endMs: number
  text: string
}

/** Jak velká část promluvy z mikrofonu se musí časem krýt s druhou stranou. */
export const ECHO_MIN_OVERLAP = 0.5
/** Kolik slov promluvy z mikrofonu musí být i v promluvě druhé strany. */
export const ECHO_MIN_SHARED = 0.6
/** Promluvy téhož mluvčího s mezerou do 30 s jsou jeden odstavec. */
export const MERGE_GAP_MS = 30_000

const end = (t: MeetingTurnRow): number => t.startMs + t.durationMs

function overlapMs(a: MeetingTurnRow, b: MeetingTurnRow): number {
  return Math.max(0, Math.min(end(a), end(b)) - Math.max(a.startMs, b.startMs))
}

function wordSet(text: string): Set<string> {
  return new Set(words(foldText(text)).filter((w) => w.length >= 2))
}

/** Je promluva z mikrofonu jen ozvěna druhé strany z reproduktorů? */
export function isEcho(me: MeetingTurnRow, others: MeetingTurnRow[]): boolean {
  if (!me.text || me.durationMs <= 0) return false
  const mine = [...wordSet(me.text)]
  if (mine.length < 2) return false
  const overlapping = others.filter((o) => o.text && overlapMs(me, o) >= ECHO_MIN_OVERLAP * me.durationMs)
  if (!overlapping.length) return false
  const theirs = new Set(overlapping.flatMap((o) => [...wordSet(o.text ?? '')]))
  const shared = mine.filter((w) => theirs.has(w)).length
  return shared / mine.length >= ECHO_MIN_SHARED
}

/** Promluvy s textem → odstavce rozhovoru v pořadí, jak zazněly. */
export function buildTranscript(turns: MeetingTurnRow[]): TranscriptBlock[] {
  const spoken = turns.filter((t) => t.status === 'ok' && t.text && t.text.trim())
  const others = spoken.filter((t) => t.track === 'other')
  const kept = spoken.filter((t) => t.track === 'other' || !isEcho(t, others))
  kept.sort((a, b) => a.startMs - b.startMs || (a.track === b.track ? a.idx - b.idx : a.track === 'me' ? -1 : 1))

  const blocks: TranscriptBlock[] = []
  for (const t of kept) {
    const text = (t.text ?? '').trim()
    const last = blocks[blocks.length - 1]
    if (last && last.speaker === t.track && t.startMs - last.endMs <= MERGE_GAP_MS) {
      last.text = `${last.text} ${text}`
      last.endMs = Math.max(last.endMs, end(t))
    } else {
      blocks.push({ speaker: t.track, startMs: t.startMs, endMs: end(t), text })
    }
  }
  return blocks
}

/** Čas od začátku schůzky: „3:07", nad hodinu „1:03:07". */
export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export interface SpeakerNames {
  me: string
  other: string
}

export const DEFAULT_SPEAKERS: SpeakerNames = { me: 'Kryštof', other: 'Klient' }

/** Přepis jako prostý text ke zkopírování a pro shrnutí modelem. */
export function transcriptText(blocks: TranscriptBlock[], names: SpeakerNames = DEFAULT_SPEAKERS): string {
  return blocks.map((b) => `[${formatOffset(b.startMs)}] ${names[b.speaker]}: ${b.text}`).join('\n\n')
}

export function transcriptWords(blocks: TranscriptBlock[]): number {
  return blocks.reduce((sum, b) => sum + words(b.text).length, 0)
}
