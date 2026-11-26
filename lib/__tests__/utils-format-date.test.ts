import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '@/lib/utils'

/**
 * Datum a čas v adminu se ukazují v pražské zóně bez ohledu na zónu serveru
 * (audit 2026-11-24, #13). Test běží s `TZ=UTC` i bez něj — výsledek musí
 * být stejný.
 */

const normalize = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('formatDate a formatDateTime', () => {
  it('pozdní večer v UTC je v Praze už další den', () => {
    const out = normalize(formatDateTime('2026-01-15T23:30:00Z'))
    expect(out).toMatch(/^16\. 1\. 2026/)
    expect(out).toMatch(/0?0:30/)
    expect(normalize(formatDate('2026-01-15T23:30:00Z'))).toBe('16. 1. 2026')
  })

  it('v létě o dvě hodiny', () => {
    expect(normalize(formatDateTime('2026-07-15T08:00:00Z'))).toMatch(/10:00/)
  })

  it('samotné datum zůstane týž den', () => {
    expect(normalize(formatDate('2026-03-01'))).toBe('1. 3. 2026')
    expect(normalize(formatDate('2026-12-31'))).toBe('31. 12. 2026')
  })

  it('prázdná hodnota je pomlčka', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDateTime(null)).toBe('—')
  })
})
