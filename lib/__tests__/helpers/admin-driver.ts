import type { AdminDriver, AdminQuery, AdminRow } from '@/lib/admin/db'

/**
 * Falešný ovladač `lib/admin/db.ts` pro testy: místo Neonu vrací řádky podle
 * textu dotazu a počítá, kolik to stálo požadavků do databáze.
 *
 * **Kolo** = jeden požadavek (jedna dávka, ať je v ní dotazů kolik chce — po
 * síti je to jedno volání). **Vlna** = kola, která odstartovala společně;
 * každá další vlna znamená, že se čekalo na odpověď té předchozí.
 *
 * Když `rowsFor` u některého dotazu vyhodí, selže celá dávka — přesně jako
 * transakce v Postgresu. Na tom stojí záložní cesta `batchTolerant`.
 */
export type RowsFor = (text: string, params: readonly unknown[]) => AdminRow[]

export type AdminDriverProbe = {
  driver: AdminDriver
  /** Požadavků do databáze celkem. */
  rounds: () => number
  /** Skupin požadavků za sebou. */
  waves: () => number
  /** Text každého dotazu, zkrácený; v pořadí, jak odcházely. */
  queries: () => string[]
  reset: () => void
}

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

export function fakeAdminDriver(rowsFor: RowsFor): AdminDriverProbe {
  let rounds = 0
  let waves = 0
  let inFlight = 0
  let queries: string[] = []

  const driver: AdminDriver = {
    async transaction(batch: AdminQuery[]) {
      rounds++
      if (inFlight === 0) waves++
      inFlight++
      try {
        const out: AdminRow[][] = []
        for (const query of batch) {
          queries.push(flat(query.text).slice(0, 80))
          out.push(rowsFor(flat(query.text), query.params))
        }
        await Promise.resolve()
        return out
      } finally {
        inFlight--
      }
    },
  }

  return {
    driver,
    rounds: () => rounds,
    waves: () => waves,
    queries: () => queries,
    reset: () => {
      rounds = 0
      waves = 0
      inFlight = 0
      queries = []
    },
  }
}
