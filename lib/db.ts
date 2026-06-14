import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let _conn: NeonQueryFunction<false, false> | null = null
const conn = (): NeonQueryFunction<false, false> => {
  if (!_conn) _conn = neon(process.env.DATABASE_URL!)
  return _conn
}

const _sql = ((...args: any[]) => (conn() as any)(...args)) as unknown as NeonQueryFunction<false, false>
Object.defineProperties(_sql, {
  query: { get: () => conn().query, configurable: true },
  unsafe: { get: () => conn().unsafe, configurable: true },
  transaction: { get: () => conn().transaction, configurable: true },
})

export const sql = _sql
