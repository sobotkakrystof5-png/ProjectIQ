import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { sql } from './db'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_WINDOW_MINUTES = 15

function getClientIp(req?: { headers?: Record<string, string | string[] | undefined> }): string {
  const fwd = req?.headers?.['x-forwarded-for']
  const value = Array.isArray(fwd) ? fwd[0] : fwd
  return value ? value.split(',')[0].trim() : 'unknown'
}

async function isLockedOut(ip: string): Promise<boolean> {
  const rows = await sql`
    SELECT count(*)::int AS count FROM login_attempts
    WHERE ip = ${ip} AND success = false
      AND created_at > now() - interval '1 minute' * ${LOCKOUT_WINDOW_MINUTES}
  `
  return (rows[0] as { count: number }).count >= MAX_FAILED_ATTEMPTS
}

async function recordAttempt(ip: string, success: boolean): Promise<void> {
  await sql`INSERT INTO login_attempts (ip, success) VALUES (${ip}, ${success})`
  await sql`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Heslo', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const ip = getClientIp(req)
        if (await isLockedOut(ip)) return null

        const adminEmail = process.env.ADMIN_EMAIL
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH

        let valid = false
        if (adminEmail && adminPasswordHash && credentials.email === adminEmail) {
          valid = await bcrypt.compare(credentials.password, adminPasswordHash)
        }

        await recordAttempt(ip, valid)
        if (!valid) return null

        return { id: '1', email: adminEmail! }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
}
