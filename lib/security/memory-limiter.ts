// Omezovač požadavků v paměti jedné instance. Nahrazuje databázi jako PRVNÍ
// pojistku: kdo posílá stovky požadavků za sekundu, nemá stát tři dotazy do
// Neonu za každý z nich (počet, zápis, úklid). Jako jediný limit nestačí —
// každá instance funkce má vlastní paměť, takže při škálování se útok rozdělí.
// Skutečnou ochranu před zahlcením dělá firewall platformy (Vercel WAF, viz
// `.claude/security/STATE.md` → Ochrana proti DDoS); tohle je vrstva za ním.
//
// Paměť je omezená: klíčů je nejvýš `maxKeys`. Útočník s miliony různých klíčů
// (rotace IPv6 adres, náhodné tokeny) tak nemůže vyčerpat paměť instance.

export type LimiterResult = {
  limited: boolean
  /** Kolik požadavků smí klíč v tomhle okně ještě poslat. */
  remaining: number
  /** Za kolik sekund se okno uvolní (aspoň 1). */
  retryAfterSec: number
}

export type MemoryLimiterOptions = {
  /** Nejvíc požadavků na klíč v jednom okně. */
  max: number
  windowMs: number
  /** Strop počtu sledovaných klíčů (výchozí 20 000 ≈ pár MB). */
  maxKeys?: number
}

type Entry = { count: number; resetAt: number }

export type MemoryLimiter = {
  /** Započítá požadavek a řekne, jestli má projít. */
  hit(key: string, now?: number): LimiterResult
  /** Počet sledovaných klíčů (pro testy a diagnostiku). */
  size(): number
}

export function createMemoryLimiter(options: MemoryLimiterOptions): MemoryLimiter {
  const { max, windowMs } = options
  const maxKeys = options.maxKeys ?? 20_000
  const entries = new Map<string, Entry>()
  let lastSweep = 0

  function sweep(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key)
    }
    lastSweep = now
  }

  /** Když je plno ani po úklidu, zahodí se nejstarších 10 % klíčů (Map drží pořadí vložení). */
  function makeRoom(now: number): void {
    if (entries.size < maxKeys) return
    sweep(now)
    if (entries.size < maxKeys) return
    let toDrop = Math.max(1, Math.floor(maxKeys / 10))
    for (const key of entries.keys()) {
      entries.delete(key)
      if (--toDrop === 0) break
    }
  }

  return {
    hit(key, now = Date.now()) {
      // Pravidelný úklid i bez tlaku na paměť, ať v klidu nezůstávají mrtvé klíče.
      if (now - lastSweep > windowMs) sweep(now)

      let entry = entries.get(key)
      if (!entry || entry.resetAt <= now) {
        makeRoom(now)
        entry = { count: 0, resetAt: now + windowMs }
        entries.set(key, entry)
      }
      entry.count += 1
      return {
        limited: entry.count > max,
        remaining: Math.max(0, max - entry.count),
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      }
    },
    size: () => entries.size,
  }
}
