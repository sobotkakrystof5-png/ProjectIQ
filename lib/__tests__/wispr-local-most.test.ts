import { describe, expect, it } from 'vitest'
import {
  buildPayload,
  buildTranscript,
  INTERVAL_SECONDS,
  isEligible,
  parseNdjson,
  parseState,
  participantsFrom,
  payloadHash,
  planSends,
  skipReason,
  speakerLabel,
  sqliteDateToIso,
} from '../../scripts/wispr-local-most.mjs'
import { meetingIngestSchema } from '@/types/meeting-notes'

// Most z Macu (R-144): čte lokální data Wispr Flow a skládá tělo pro /api/public/schuzky.

const speakerMap = {
  people: {
    'voice-1-user': { name: 'Kryštof', contactId: null, origin: 'user' },
    'voice-2-llm': { name: 'Honza', contactId: null, origin: 'llm' },
    'voice-2-alt': { name: 'Jan Odhad', contactId: null, origin: 'llm' },
  },
  assignments: {
    '1': { user: 'voice-1-user', dom: null, mic: null, llm: null },
    '2': { user: null, dom: null, mic: null, llm: 'voice-2-llm' },
    '3': { user: null, dom: null, mic: null, llm: null },
  },
  rooms: [],
}

const ndjson = [
  { id: 'a', timestamp: '00:01', text: 'Dobrý den, tak jdeme na to.', speaker: { id: 1, source: 'x', name: null } },
  { id: 'b', timestamp: '00:04', text: 'Jasně, eee,  web do konce měsíce?', speaker: { id: 2, source: 'x', name: null } },
  { id: 'c', timestamp: '00:09', text: '', speaker: { id: 3, source: 'x', name: null } },
  { id: 'd', timestamp: '00:12', text: 'A já přidám fotky.', speaker: { id: 3, source: 'x', name: null } },
]
  .map((o) => JSON.stringify(o))
  .join('\n')

const row = {
  id: '6044f143-73d9-4033-a177-31490e649da2',
  title: 'Product Distribution Partnership Discussion',
  createdAt: '2026-11-04 15:01:30.364 +00:00',
  endedAt: 1793806762108,
  calendarOccurrenceStartAtUtc: null,
  recordedMs: 2271803,
  finalized: 1,
  isDeleted: 0,
  transcriptReady: 1,
  contentWithheld: 0,
  transcriptDeletedAt: null,
  shareSlug: '6rWQdK9x6lkaXGcbUUOcwETWb-ZAGnQG0V5Qrr8PmzU',
  speakerMap: JSON.stringify(speakerMap),
  summary: '### Shrnutí\n- body',
}

describe('most Wispr Flow z Macu', () => {
  it('jméno mluvčího: uživatel má přednost před odhadem, bez jména „Speaker N"', () => {
    expect(speakerLabel(1, speakerMap)).toBe('Kryštof')
    expect(speakerLabel(2, speakerMap)).toBe('Honza')
    expect(speakerLabel(3, speakerMap)).toBe('Speaker 3')
    expect(speakerLabel(7, null)).toBe('Speaker 7')
  })

  it('přepis je doslovný: text segmentu se nemění, prázdné segmenty vypadnou', () => {
    const transcript = buildTranscript(parseNdjson(ndjson), speakerMap)
    expect(transcript).toBe(
      'Kryštof: Dobrý den, tak jdeme na to.\nHonza: Jasně, eee,  web do konce měsíce?\nSpeaker 3: A já přidám fotky.',
    )
  })

  it('čas z databáze Wispr Flow → ISO', () => {
    expect(sqliteDateToIso('2026-11-04 15:01:30.364 +00:00')).toBe('2026-11-04T15:01:30.364Z')
    expect(sqliteDateToIso('2026-11-04 16:01:30 +01:00')).toBe('2026-11-04T15:01:30.000Z')
    expect(sqliteDateToIso('nesmysl')).toBeNull()
  })

  it('tělo projde schématem vstupu a nese odkaz, shrnutí i přesnou délku', () => {
    const transcript = buildTranscript(parseNdjson(ndjson), speakerMap)
    const payload = buildPayload(row, transcript)
    expect(meetingIngestSchema.safeParse(payload).success).toBe(true)
    expect(payload.share_link).toBe('https://notes.wisprflow.ai/shared/6rWQdK9x6lkaXGcbUUOcwETWb-ZAGnQG0V5Qrr8PmzU')
    expect(payload.start).toBe('2026-11-04T15:01:30.364Z')
    expect(payload.end).toBe(new Date(1793806762108).toISOString())
    expect(payload.transcript_chars).toBe(transcript.length)
    expect(payload.participants.map((p: { name: string }) => p.name)).toEqual(['Kryštof', 'Honza', 'Jan Odhad'])
  })

  it('podivný odkaz a prázdný název se neposílají', () => {
    const payload = buildPayload({ ...row, shareSlug: 'x"><script>', title: '  ' }, 'Speaker 1: ahoj')
    expect(payload.share_link).toBeNull()
    expect(payload.title).toBeNull()
  })

  it('posílá jen hotové schůzky delší než minuta', () => {
    expect(isEligible(row)).toBe(true)
    expect(isEligible({ ...row, recordedMs: 34905 })).toBe(false)
    expect(isEligible({ ...row, finalized: 0 })).toBe(false)
    expect(isEligible({ ...row, isDeleted: 1 })).toBe(false)
    expect(isEligible({ ...row, transcriptReady: 0 })).toBe(false)
    expect(isEligible({ ...row, transcriptDeletedAt: '2026-11-10' })).toBe(false)
  })

  it('důvod vynechání: rozpracovaná schůzka čeká na další běh, ne na příští hodinu', () => {
    expect(INTERVAL_SECONDS).toBeLessThanOrEqual(300)
    expect(skipReason(row)).toBeNull()
    expect(skipReason({ ...row, finalized: 0 })).toBe('probiha')
    expect(skipReason({ ...row, transcriptReady: 0 })).toBe('probiha')
    expect(skipReason({ ...row, recordedMs: 34905 })).toBe('kratka')
    expect(skipReason({ ...row, recordedMs: null })).toBe('kratka')
    expect(skipReason({ ...row, isDeleted: 1 })).toBe('smazana')
    expect(skipReason({ ...row, contentWithheld: 1 })).toBe('skryta')
  })

  it('otisk se změní s přepisem, názvem i jmény mluvčích, jinak ne', () => {
    const transcript = buildTranscript(parseNdjson(ndjson), speakerMap)
    const base = buildPayload(row, transcript)
    expect(payloadHash(buildPayload(row, transcript))).toBe(payloadHash(base))
    expect(payloadHash(buildPayload(row, `${transcript}\nKryštof: Ještě jedna věta.`))).not.toBe(payloadHash(base))
    expect(payloadHash(buildPayload({ ...row, title: 'Jiný název' }, transcript))).not.toBe(payloadHash(base))
    const renamed = JSON.stringify({ ...speakerMap, people: { ...speakerMap.people, 'voice-2-llm': { name: 'Jan Novák' } } })
    expect(payloadHash(buildPayload({ ...row, speakerMap: renamed }, transcript))).not.toBe(payloadHash(base))
  })

  it('stav: poškozený nebo cizí obsah se bere jako prázdný', () => {
    expect(parseState('')).toEqual({ sent: {}, heartbeatAt: 0 })
    expect(parseState('{nesmysl')).toEqual({ sent: {}, heartbeatAt: 0 })
    const good = 'a'.repeat(64)
    expect(parseState(JSON.stringify({ sent: { x: good, y: 'kratky', z: 5 }, heartbeatAt: 12 }))).toEqual({
      sent: { x: good },
      heartbeatAt: 12,
    })
  })

  it('plán: posílá jen nové a přepočítané, nezměněné jen na vyžádání', () => {
    const state = { sent: { a: 'h1', b: 'h2' }, heartbeatAt: 0 }
    const items = [
      { id: 'a', hash: 'h1' },
      { id: 'b', hash: 'h2-novy' },
      { id: 'c', hash: 'h3' },
    ]
    expect(planSends(items, state).map((i: { id: string; kind: string }) => `${i.id}:${i.kind}`)).toEqual(['b:changed', 'c:new'])
    expect(planSends(items, state, true).map((i: { id: string; kind: string }) => `${i.id}:${i.kind}`)).toEqual([
      'a:forced',
      'b:changed',
      'c:new',
    ])
  })

  it('účastníci jen se jménem, bez duplicit', () => {
    expect(participantsFrom({ people: { a: { name: 'X' }, b: { name: 'X' }, c: { name: '' } } })).toEqual([
      { name: 'X', emails: [], spoke: true },
    ])
    expect(participantsFrom(null)).toEqual([])
  })
})
