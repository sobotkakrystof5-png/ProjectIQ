import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

// Constant-time comparison guards against timing attacks on the API key check.
export function verifyApiKey(req: NextRequest, envVarName: string): boolean {
  const expected = process.env[envVarName]
  if (!expected) return false

  const provided = req.headers.get('x-api-key')
  if (!provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

// Cron endpoints authenticate via `Authorization: Bearer <CRON_SECRET>` (Vercel Cron's
// native format). Fails closed: a missing CRON_SECRET means no request is authorized,
// never "allow everything through".
export function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const provided = auth.slice('Bearer '.length)

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}
