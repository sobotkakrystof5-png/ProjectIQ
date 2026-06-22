'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

export async function toggleDeadlineDone(id: string, done: boolean) {
  await requireAuth()
  await sql`
    UPDATE school_deadlines
    SET done = ${done}
    WHERE id = ${id} AND user_id IS NULL
  `
  revalidatePath('/hub/school')
}
