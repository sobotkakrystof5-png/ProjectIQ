import { describe, expect, it } from 'vitest'
import { errorSummary, maskEmail } from '../log-safe'

describe('log-safe (audit 2026-11-24, #29)', () => {
  it('zakryje e-mail, doménu nechá', () => {
    expect(maskEmail('jana.novakova@example.cz')).toBe('j***@example.cz')
    expect(maskEmail('Recipient <a@b.cz> rejected')).toBe('Recipient <a***@b.cz> rejected')
  })

  it('chyba = název, kód a zpráva bez e-mailu, bez detailu a dotazu', () => {
    const err = Object.assign(new Error('duplicate key for jana@example.cz'), {
      code: '23505',
      detail: 'Key (email)=(jana@example.cz) already exists.',
      query: 'INSERT INTO x VALUES ($1)',
    })
    const out = errorSummary(err)
    expect(out).toBe('Error 23505: duplicate key for j***@example.cz')
    expect(out).not.toContain('already exists')
    expect(errorSummary('nic')).toBe('nic')
    expect(errorSummary({ foo: 1 })).toBe('neznámá chyba')
    expect(errorSummary(new Error('x'.repeat(500))).length).toBe(200)
  })
})
