'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'

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
