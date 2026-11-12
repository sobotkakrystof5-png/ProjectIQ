import type { PGlite } from '@electric-sql/pglite'
import type { AdminDriver, AdminRow } from '@/lib/admin/db'

/**
 * Ovladač `lib/admin/db.ts` nad PGlite (Postgres ve WASM) — testy tak pouštějí
 * **tentýž SQL**, jaký jde na Neon, místo falešných řádků podle textu dotazu.
 *
 * Dávka se tu provádí po dotazech za sebou, ne v jedné transakci: testům jde
 * o chování SQL, ne o atomicitu (tu drží Neon HTTP transakce v produkci).
 */
export function pgliteAdminDriver(db: PGlite): AdminDriver {
  return {
    async transaction(queries) {
      const out: AdminRow[][] = []
      for (const query of queries) {
        const res = await db.query(query.text, [...query.params])
        out.push(res.rows as AdminRow[])
      }
      return out
    },
  }
}
