import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let _sql: NeonQueryFunction<false, false> | null = null

const getConn = () => {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!)
  return _sql
}

export const sql: NeonQueryFunction<false, false> = (strings, ...values) =>
  getConn()(strings as TemplateStringsArray, ...values)
