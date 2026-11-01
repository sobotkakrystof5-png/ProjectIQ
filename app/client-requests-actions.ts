'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// Admin strana požadavků klientů (`/dashboard/pozadavky`). Veřejné odeslání
// požadavku je v `app/portal-actions.ts`.

const idSchema = z.string().uuid()
const statusSchema = z.enum(['new', 'done', 'dismissed'])

export async function setClientRequestStatus(
  id: string,
  status: 'new' | 'done' | 'dismissed',
): Promise<{ success: boolean; error?: string }> {
  await requireAuth()
  const parsedId = idSchema.safeParse(id)
  const parsedStatus = statusSchema.safeParse(status)
  if (!parsedId.success || !parsedStatus.success) return { success: false, error: 'Neplatná data.' }

  await sql`
    UPDATE client_requests
    SET status = ${parsedStatus.data},
        handled_at = ${parsedStatus.data === 'new' ? null : new Date().toISOString()}
    WHERE id = ${parsedId.data}
  `
  revalidatePath('/dashboard/pozadavky')
  return { success: true }
}
