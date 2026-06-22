import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Proxy na cron endpoint — spouští se ručně z UI (admin only)
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cronUrl = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/cron/scrape-school`
  const secret = process.env.CRON_SECRET

  const res = await fetch(cronUrl, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    cache: 'no-store',
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
