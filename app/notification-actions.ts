'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sql } from '@/lib/db'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Neautorizovaný přístup')
}

export async function markNotificationRead(id: string) {
  await requireAuth()
  await sql`UPDATE notifications SET read = true WHERE id = ${id}`
  revalidatePath('/dashboard/notifications')
  revalidatePath('/dashboard')
}

export async function markAllNotificationsRead() {
  await requireAuth()
  await sql`UPDATE notifications SET read = true WHERE read = false`
  revalidatePath('/dashboard/notifications')
  revalidatePath('/dashboard')
}
