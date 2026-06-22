import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchFoods } from '@/lib/fatsecret'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  if (!process.env.FATSECRET_CLIENT_ID) {
    return NextResponse.json({ error: 'FatSecret API not configured' }, { status: 503 })
  }

  try {
    const results = await searchFoods(q)
    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: 'FatSecret API chyba' }, { status: 500 })
  }
}
