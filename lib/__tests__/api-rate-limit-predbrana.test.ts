import { beforeEach, describe, expect, it, vi } from 'vitest'

// Paměťová pojistka před databázovým limitem: zahlcení se zahodí bez dotazu do Neonu
// a běžný provoz (do čtyřnásobku povoleného počtu) databázi pořád dostane.
const sql = vi.fn()
vi.mock('@/lib/db', () => ({ sql: (...args: unknown[]) => sql(...args) }))

import { isApiRateLimited, PRE_GATE_FACTOR, recordApiRequest } from '@/lib/api-rate-limit'

describe('lib/api-rate-limit — paměťová předbrána', () => {
  beforeEach(() => {
    sql.mockReset().mockResolvedValue([{ count: 0 }])
  })

  it('klient pod limitem databázi dotazuje a projde', async () => {
    expect(await isApiRateLimited('test-pod', '203.0.113.1', 1, 10)).toBe(false)
    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('zahlcení se po násobku limitu zahazuje bez jediného dotazu do databáze', async () => {
    const max = 5
    for (let i = 0; i < max * PRE_GATE_FACTOR; i += 1) await isApiRateLimited('test-zaplava', '203.0.113.2', 1, max)
    expect(sql).toHaveBeenCalledTimes(max * PRE_GATE_FACTOR)

    sql.mockClear()
    for (let i = 0; i < 500; i += 1) expect(await isApiRateLimited('test-zaplava', '203.0.113.2', 1, max)).toBe(true)
    expect(sql).not.toHaveBeenCalled()
  })

  it('jiný klient ani jiný endpoint zahlcením netrpí', async () => {
    for (let i = 0; i < 100; i += 1) await isApiRateLimited('test-izolace', '203.0.113.3', 1, 2)
    sql.mockClear()
    expect(await isApiRateLimited('test-izolace', '203.0.113.4', 1, 2)).toBe(false)
    expect(await isApiRateLimited('jiny-endpoint', '203.0.113.3', 1, 2)).toBe(false)
  })

  it('IPv6 z jedné sítě /64 sdílí pojistku', async () => {
    for (let i = 0; i < 40; i += 1) await isApiRateLimited('test-v6', `2001:db8:5:6:${i.toString(16)}::1`, 1, 10)
    sql.mockClear()
    expect(await isApiRateLimited('test-v6', '2001:db8:5:6:abcd::9', 1, 10)).toBe(true)
    expect(sql).not.toHaveBeenCalled()
  })

  it('IPv6 z jedné sítě /64 sdílí i databázový limit (audit #12)', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5) // bez občasného úklidu
    await recordApiRequest('test-v6-db', '2001:db8:7:8:1::1')
    await isApiRateLimited('test-v6-db', '2001:db8:7:8:ffff::2', 1, 10)
    const insertKey = sql.mock.calls[0][2]
    const queryKey = sql.mock.calls[1][2]
    expect(insertKey).toBe('2001:0db8:0007:0008::/64')
    expect(queryKey).toBe(insertKey)
    // IPv4 se ukládá celá.
    sql.mockClear()
    await recordApiRequest('test-v4-db', '203.0.113.9')
    expect(sql.mock.calls[0][2]).toBe('203.0.113.9')
    random.mockRestore()
  })

  it('databázový limit dál rozhoduje přesně', async () => {
    sql.mockResolvedValue([{ count: 10 }])
    expect(await isApiRateLimited('test-db', '203.0.113.5', 1, 10)).toBe(true)
  })

  it('zápis požadavku jen vloží řádek; úklid běží občas, ne při každém požadavku', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    await recordApiRequest('ep', '203.0.113.6')
    expect(sql).toHaveBeenCalledTimes(1)

    sql.mockClear()
    random.mockReturnValue(0.001)
    await recordApiRequest('ep', '203.0.113.6')
    expect(sql).toHaveBeenCalledTimes(2)
    random.mockRestore()
  })
})
