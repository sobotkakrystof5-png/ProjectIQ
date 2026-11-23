import { describe, expect, it } from 'vitest'
import { createMemoryLimiter } from '../memory-limiter'

describe('createMemoryLimiter', () => {
  it('pustí povolený počet a pak zastaví', () => {
    const limiter = createMemoryLimiter({ max: 3, windowMs: 10_000 })
    const results = [1, 2, 3, 4].map(() => limiter.hit('ip', 1_000))
    expect(results.map((r) => r.limited)).toEqual([false, false, false, true])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0])
  })

  it('klíče se nepočítají dohromady', () => {
    const limiter = createMemoryLimiter({ max: 1, windowMs: 10_000 })
    expect(limiter.hit('a', 0).limited).toBe(false)
    expect(limiter.hit('a', 0).limited).toBe(true)
    expect(limiter.hit('b', 0).limited).toBe(false)
  })

  it('po uplynutí okna se počítá znovu', () => {
    const limiter = createMemoryLimiter({ max: 1, windowMs: 10_000 })
    limiter.hit('ip', 0)
    expect(limiter.hit('ip', 5_000).limited).toBe(true)
    expect(limiter.hit('ip', 10_000).limited).toBe(false)
  })

  it('Retry-After říká, za kolik sekund se okno uvolní (aspoň 1)', () => {
    const limiter = createMemoryLimiter({ max: 1, windowMs: 10_000 })
    limiter.hit('ip', 0)
    expect(limiter.hit('ip', 2_500).retryAfterSec).toBe(8)
    expect(limiter.hit('ip', 9_999).retryAfterSec).toBe(1)
  })

  it('paměť je omezená: miliony různých klíčů nepřerostou strop', () => {
    const limiter = createMemoryLimiter({ max: 5, windowMs: 60_000, maxKeys: 100 })
    for (let i = 0; i < 10_000; i += 1) limiter.hit(`ip-${i}`, 1_000)
    expect(limiter.size()).toBeLessThanOrEqual(100)
  })

  it('po zaplnění se nejdřív uklidí prošlá okna, ne živé klíče', () => {
    const limiter = createMemoryLimiter({ max: 5, windowMs: 1_000, maxKeys: 10 })
    for (let i = 0; i < 10; i += 1) limiter.hit(`stary-${i}`, 0)
    // Všechna stará okna jsou po 2 s prošlá — nový klíč je smí vytlačit celá.
    limiter.hit('novy', 2_000)
    expect(limiter.size()).toBe(1)
  })

  it('klient, který byl zastaven, zůstane zastavený, i když paměť čistí cizí klíče', () => {
    const limiter = createMemoryLimiter({ max: 2, windowMs: 60_000, maxKeys: 1_000 })
    limiter.hit('utocnik', 0)
    limiter.hit('utocnik', 0)
    expect(limiter.hit('utocnik', 1).limited).toBe(true)
    for (let i = 0; i < 50; i += 1) limiter.hit(`jiny-${i}`, 2)
    expect(limiter.hit('utocnik', 3).limited).toBe(true)
  })
})
