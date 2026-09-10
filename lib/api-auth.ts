import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

// Constant-time comparison guards against timing attacks on the API key check.
function constantTimeMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

export function verifyApiKey(req: NextRequest, envVarName: string): boolean {
  const expected = process.env[envVarName]
  if (!expected) return false

  const provided = req.headers.get('x-api-key')
  if (!provided) return false

  return constantTimeMatch(provided, expected)
}

// Cron endpoints authenticate via `Authorization: Bearer <CRON_SECRET>` (Vercel Cron's
// native format). Fails closed: a missing CRON_SECRET means no request is authorized,
// never "allow everything through".
export function verifyCronSecret(req: NextRequest): boolean {
  return verifyBearerApiKey(req, 'CRON_SECRET')
}

// Sdílené s cronem — externí systémy jako vizeon-lead-agent posílají klíč
// v `Authorization: Bearer <klíč>` místo `x-api-key`.
export function verifyBearerApiKey(req: NextRequest, envVarName: string): boolean {
  const expected = process.env[envVarName]
  if (!expected) return false

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const provided = auth.slice('Bearer '.length)

  return constantTimeMatch(provided, expected)
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : 'unknown'
}
