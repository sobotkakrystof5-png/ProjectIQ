'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { sql } from '@/lib/db'
import { summarizeClientRequest } from '@/lib/client-request-ai'
import { REQUEST_MAX_CHARS } from '@/lib/client-requests'

// Akce schránky Zprávy (KP15). Admin běží vlastníkem tabulek; každá akce
// začíná requireAuth().

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

const idSchema = z.string().uuid()

/** Schránka má vlákno otevřené; `read` jen když je karta vidět. */
export async function adminTouchThread(projectId: string, read: boolean): Promise<void> {
  await requireAuth()
  const id = idSchema.safeParse(projectId)
  if (!id.success) return
  await adminDb`SELECT portal_admin_touch(${id.data}, ${read === true})`.catch((err: unknown) => {
    if ((err as { code?: string })?.code !== 'P0002') console.error('[chat] přečteno selhalo:', err instanceof Error ? err.name : 'unknown')
  })
}

const requestSchema = z.object({
  projectId: z.string().uuid(),
  messageIds: z.array(z.string().uuid()).min(1, 'Vyberte aspoň jednu zprávu.').max(30),
})

/**
 * „Udělat z toho zadání" (R-122): z vybraných zpráv klienta vznikne požadavek
 * v /dashboard/pozadavky se shrnutím a zadáním pro Claude Code (R-069).
 * Jen zprávy klienta téhle zakázky — cizí zprávu nepřijme. Nic se nespustí samo.
 */
export async function makeRequestFromMessages(projectId: string, messageIds: string[]): Promise<Result<{ requestId: string }>> {
  await requireAuth()
  const parsed = requestSchema.safeParse({ projectId, messageIds: [...new Set(messageIds)] })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Neplatný výběr.' }
  const { projectId: pid, messageIds: ids } = parsed.data

  const rows = await adminDb<{ id: string; body: string; kind: string }>`
    SELECT id::text, body, kind FROM portal.messages
    WHERE project_id = ${pid} AND id = ANY(${ids}::uuid[]) AND author = 'client' AND kind IN ('text', 'voice', 'approval_answer')
    ORDER BY created_at
  `
  if (rows.length !== ids.length) return { success: false, error: 'Zadání jde udělat jen ze zpráv klienta u téhle zakázky.' }
  const text = rows.map((r) => r.body.trim()).filter(Boolean).join('\n\n').slice(0, REQUEST_MAX_CHARS)
  if (text.length < 3) return { success: false, error: 'Vybrané zprávy nemají text.' }
  const source = rows.some((r) => r.kind === 'voice') ? 'voice' : 'text'

  const [created] = await adminDb.batch([
    { text: `INSERT INTO client_requests (project_id, source, raw_text) VALUES ($1, $2, $3) RETURNING id::text`, params: [pid, source, text] },
  ])
  const requestId = String(created[0].id)
  await adminDb`
    UPDATE portal.messages SET admin_request_id = ${requestId}, request_status = 'new', updated_at = now()
    WHERE project_id = ${pid} AND id = ANY(${ids}::uuid[])
  `

  after(async () => {
    const info = (await sql`SELECT client_name, description, focus FROM projects WHERE id = ${pid}`)[0] as
      | { client_name: string; description: string | null; focus: string | null }
      | undefined
    if (!info) return
    const ai = await summarizeClientRequest({ text, clientName: info.client_name, description: info.description, focus: info.focus })
    try {
      if (ai.data) {
        await sql`
          UPDATE client_requests
          SET ai_status = 'ready', ai_kind = ${ai.data.kind}, ai_summary = ${ai.data.summary},
              ai_prompt = ${ai.data.prompt}, ai_unclear = ${ai.data.unclear}
          WHERE id = ${requestId}
        `
      } else {
        await sql`UPDATE client_requests SET ai_status = 'failed' WHERE id = ${requestId}`
      }
    } catch (err) {
      console.error('[chat] uložení shrnutí selhalo:', err instanceof Error ? err.name : 'unknown')
    }
  })

  revalidatePath(`/dashboard/zpravy/${pid}`)
  revalidatePath('/dashboard/pozadavky')
  return { success: true, requestId }
}
