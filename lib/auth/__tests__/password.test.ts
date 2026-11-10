import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../messages'

describe('pravidla hesla (R-081)', () => {
  it('pustí heslo s délkou a malým, velkým písmenem i číslicí', () => {
    expect(passwordProblem('Zahrada2026')).toBeNull()
    expect(passwordProblem('Aa3' + 'x'.repeat(MIN_PASSWORD_LENGTH - 3))).toBeNull()
  })

  it('krátké, dlouhé a jednotvárné heslo odmítne s vysvětlením', () => {
    expect(passwordProblem('Aa3xxxx')).toMatch(/krátké/)
    expect(passwordProblem('Aa3' + 'x'.repeat(80))).toMatch(/dlouhé/)
    expect(passwordProblem('zahrada2026')).toMatch(/velké/)
    expect(passwordProblem('ZAHRADA2026')).toMatch(/malé/)
    expect(passwordProblem('Zahradniky')).toMatch(/číslici/)
  })
})
