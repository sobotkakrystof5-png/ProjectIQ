import { describe, expect, it } from 'vitest'
import { buildTranscript, formatOffset, isEcho, transcriptCheck, transcriptText, transcriptWords, type MeetingTurnRow } from '../meeting-transcript'

// ZakazIQ Voice — schůzky (R-151): složení přepisu ze dvou stop.

const turn = (track: 'me' | 'other', idx: number, startMs: number, durationMs: number, text: string | null, status = 'ok'): MeetingTurnRow => ({
  track, idx, startMs, durationMs, text, status,
})

describe('přepis schůzky', () => {
  it('seřadí promluvy obou stran podle času a spojí po sobě jdoucí téhož mluvčího', () => {
    const blocks = buildTranscript([
      turn('other', 0, 4_000, 3_000, 'Dobrý den, slyšíme se?'),
      turn('me', 0, 0, 2_500, 'Dobrý den.'),
      turn('me', 1, 8_000, 4_000, 'Ano, slyším vás dobře.'),
      turn('me', 2, 13_000, 2_000, 'Můžeme začít.'),
      turn('other', 1, 60_000, 2_000, 'Jasně.'),
    ])
    expect(blocks.map((b) => [b.speaker, b.text])).toEqual([
      ['me', 'Dobrý den.'],
      ['other', 'Dobrý den, slyšíme se?'],
      ['me', 'Ano, slyším vás dobře. Můžeme začít.'],
      ['other', 'Jasně.'],
    ])
    expect(transcriptText(blocks)).toBe(
      '[0:00] Kryštof: Dobrý den.\n\n[0:04] Klient: Dobrý den, slyšíme se?\n\n[0:08] Kryštof: Ano, slyším vás dobře. Můžeme začít.\n\n[1:00] Klient: Jasně.',
    )
    expect(transcriptWords(blocks)).toBe(13)
  })

  it('nevynechá nic kromě prázdných, chybných a zablokovaných promluv', () => {
    const blocks = buildTranscript([
      turn('me', 0, 0, 1_000, '', 'empty'),
      turn('me', 1, 2_000, 1_000, null, 'error'),
      turn('other', 0, 3_000, 1_000, null, 'blocked'),
      turn('other', 1, 5_000, 1_000, 'Platí.'),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Platí.')
  })

  it('mezera nad 30 s téhož mluvčího je nový odstavec', () => {
    const blocks = buildTranscript([turn('me', 0, 0, 1_000, 'Moment.'), turn('me', 1, 40_000, 1_000, 'Tak jsem zpátky.')])
    expect(blocks).toHaveLength(2)
  })

  it('ozvěnu druhé strany v mikrofonu vynechá, vlastní řeč ve stejnou chvíli ne', () => {
    const other = turn('other', 0, 10_000, 6_000, 'Cena za e-shop bude osmdesát tisíc korun.')
    const echo = turn('me', 0, 10_200, 5_800, 'cena za eshop bude osmdesát tisíc korun')
    const own = turn('me', 1, 11_000, 3_000, 'Rozumím, to dává smysl.')
    expect(isEcho(echo, [other])).toBe(true)
    expect(isEcho(own, [other])).toBe(false)
    const blocks = buildTranscript([other, echo, own])
    expect(blocks.map((b) => b.text)).toEqual(['Cena za e-shop bude osmdesát tisíc korun.', 'Rozumím, to dává smysl.'])
  })

  it('stejná slova v jiném čase nejsou ozvěna', () => {
    const other = turn('other', 0, 10_000, 3_000, 'Pošlete mi to e-mailem.')
    const later = turn('me', 0, 30_000, 3_000, 'Pošlete mi to e-mailem.')
    expect(isEcho(later, [other])).toBe(false)
  })

  it('čas od začátku schůzky', () => {
    expect(formatOffset(0)).toBe('0:00')
    expect(formatOffset(187_400)).toBe('3:07')
    expect(formatOffset(3_787_000)).toBe('1:03:07')
  })

  it('kontrola po schůzce spočítá promluvy obou stran a ozvěnu', () => {
    const turns = [
      turn('me', 0, 0, 3000, 'Dobrý den, slyšíme se?'),
      turn('other', 0, 4000, 5000, 'Ano, cena bude čtyřicet tisíc korun.'),
      turn('me', 1, 4200, 4500, 'cena bude čtyřicet tisíc korun'),
      turn('me', 2, 12_000, 2000, null, 'empty'),
      turn('other', 1, 15_000, 2000, 'Nashledanou.', 'error'),
    ]
    expect(transcriptCheck(turns)).toEqual({ meTurns: 1, otherTurns: 1, echoTurns: 1 })
    expect(transcriptCheck([turn('me', 0, 0, 2000, 'Haló, slyšíte mě?')])).toEqual({ meTurns: 1, otherTurns: 0, echoTurns: 0 })
  })
})

