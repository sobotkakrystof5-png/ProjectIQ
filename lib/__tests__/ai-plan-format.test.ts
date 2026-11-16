import { describe, expect, it } from 'vitest'
import { coercePlan, emptyToNull, extractJson } from '@/lib/ai/plan-format'
import { todayLine } from '@/lib/ai/propose'

/**
 * Odpověď modelu → plán (R-111). Model vrací JSON podle popisu v promptu,
 * ne podle gramatiky, takže tahle kontrola je jediná brána: co jí neprojde,
 * se neprovede.
 */

const meeting = {
  kind: 'schedule_event',
  title: 'Schůzka s Novákem',
  date: '2026-11-19',
  time: '14:00',
  durationMinutes: 60,
  contactName: 'Jan Novák',
  phone: null,
  email: null,
  note: null,
}

const wrap = (actions: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ actions, reply: 'Zapíšu to.', confidence: 0.9, assumptions: [], missing: [], ...extra })

describe('JSON z odpovědi', () => {
  it('přečte čistý JSON i JSON obalený textem nebo ```', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('Tady je plán:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('nic')).toBeNull()
  })

  it('odpověď bez pole akcí není plán', () => {
    expect(coercePlan('{"reply":"ahoj"}')).toBeNull()
    expect(coercePlan('nesmysl')).toBeNull()
  })
})

describe('přísná kontrola', () => {
  it('platnou akci propustí beze změny', () => {
    expect(coercePlan(wrap([meeting]))?.actions).toEqual([meeting])
  })

  it('vadnou akci zahodí, zbytek plánu nechá a řekne proč', () => {
    const plan = coercePlan(wrap([meeting, { ...meeting, date: '19. 11.' }, { kind: 'run_sql', sql: 'DROP TABLE x' }]))
    expect(plan?.actions).toHaveLength(1)
    expect(plan?.missing.join(' ')).toContain('nesestavil správně')
  })

  it('opraví čas se sekundami i bez nuly a doplní délku termínu', () => {
    const plan = coercePlan(wrap([{ ...meeting, time: '14:00:00' }, { ...meeting, time: '9:30', durationMinutes: 0 }]))
    expect(plan?.actions.map((a) => (a.kind === 'schedule_event' ? [a.time, a.durationMinutes] : null))).toEqual([
      ['14:00', 60],
      ['09:30', 60],
    ])
  })

  it('prázdné texty a nulové částky jsou „nezaznělo"', () => {
    expect(emptyToNull({ phone: '', amount: 0, count: 0 })).toEqual({ phone: null, amount: null, count: 0 })
    // Prázdný odkaz je žádný odkaz.
    expect(emptyToNull({ project: { id: '', hint: '' } })).toEqual({ project: null })
  })

  it('jednorázový příjem bez zakázky projde', () => {
    const plan = coercePlan(
      wrap([{ kind: 'add_payment', paymentType: 'jednorazovy', project: { id: null, hint: null }, amount: 1200, date: null, note: '' }]),
    )
    expect(plan?.actions[0]).toMatchObject({ kind: 'add_payment', project: null, amount: 1200, note: null })
  })

  it('jistotu drží mezi 0 a 1 a víc než osm akcí nepustí', () => {
    const plan = coercePlan(wrap(Array(12).fill(meeting), { confidence: 7 }))
    expect(plan?.confidence).toBe(1)
    expect(plan?.actions).toHaveLength(8)
  })
})

describe('dnešek pro model', () => {
  it('nese den v týdnu', () => {
    expect(todayLine('2026-11-16')).toBe('Dnes je pondělí 2026-11-16.')
    expect(todayLine('2026-11-19')).toBe('Dnes je čtvrtek 2026-11-19.')
  })
})
