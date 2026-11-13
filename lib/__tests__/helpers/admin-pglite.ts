import type { PGlite } from '@electric-sql/pglite'
import type { AdminDriver, AdminRow } from '@/lib/admin/db'

/**
 * Ovladač `lib/admin/db.ts` nad PGlite (Postgres ve WASM) — testy tak pouštějí
 * **tentýž SQL**, jaký jde na Neon, místo falešných řádků podle textu dotazu.
 *
 * Dávka se standardně provádí po dotazech za sebou, ne v jedné transakci:
 * většině testů jde o chování SQL, ne o atomicitu.
 *
 * `{ transactional: true }` dávku obalí skutečnou transakcí — tak se dá
 * ověřit to, co v produkci drží Neon HTTP transakce: když jeden příkaz
 * selže, neplatí ani ty před ním (AD13, uložení faktury).
 */
export function pgliteAdminDriver(db: PGlite, options: { transactional?: boolean } = {}): AdminDriver {
  return {
    async transaction(queries) {
      const atomic = options.transactional === true && queries.length > 1
      if (atomic) await db.exec('BEGIN')
      try {
        const out: AdminRow[][] = []
        for (const query of queries) {
          const res = await db.query(query.text, [...query.params])
          out.push(res.rows as AdminRow[])
        }
        if (atomic) await db.exec('COMMIT')
        return out
      } catch (err) {
        if (atomic) await db.exec('ROLLBACK')
        throw err
      }
    },
  }
}
