import { describe, expect, it } from 'vitest'
import { parsePrivacyMode, PRIVACY_COOKIE } from '../privacy'

describe('režim soukromí', () => {
  it('zapne se jen pro výslovnou hodnotu cookie a má pevné jméno', () => {
    expect(PRIVACY_COOKIE).toBe('ws_soukromi')
    expect(parsePrivacyMode('1')).toBe(true)
    for (const value of [undefined, null, '', '0', 'true', '11']) expect(parsePrivacyMode(value)).toBe(false)
  })
})
