'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { getPortalContext } from '@/lib/portal/context'
import { portalDb } from '@/lib/portal/db'
import { pgErrorCode } from '@/lib/ws/db'
import { notifyNewMessage } from '@/lib/admin/chat'

// Akce chatu v klientském prostoru (KP15). Člen ze session, vše ostatní
// ověřují databázové funkce portal.touch_thread a portal.answer_approval.

type ActionResult = { success: boolean; error?: string }

const idSchema = z.string().uuid()

/** Vlákno je otevřené (každých 10 s); `read` jen když je karta vidět. */
export async function touchThread(projectId: string, read: boolean): Promise<void> {
  const ctx = await getPortalContext()
  const id = idSchema.safeParse(projectId)
  if (!ctx || !id.success) return
  try {
    await portalDb({ clientId: ctx.clientId })`SELECT portal.touch_thread(${id.data}, ${ctx.memberId}, ${read === true})`
  } catch (err) {
    if (pgErrorCode(err) !== 'P0002') console.error('[chat] zápis přečtení selhal:', err instanceof Error ? err.name : 'unknown')
  }
}

const answerSchema = z.object({
  decision: z.enum(['approved', 'changes']),
  body: z.string().trim().max(2000, 'Zpráva může mít nejvýše 2000 znaků.'),
})

/** „Schvaluji", nebo „Chci změny" s textem. Odpovídá se jednou (R-122). */
export async function answerApproval(messageId: string, raw: { decision: 'approved' | 'changes'; body: string }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = idSchema.safeParse(messageId)
  const parsed = answerSchema.safeParse(raw)
  if (!id.success) return { success: false, error: 'Tahle zpráva nebyla nalezena.' }
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím text.' }
  if (parsed.data.decision === 'changes' && parsed.data.body.length < 3) {
    return { success: false, error: 'Napište prosím, co chcete změnit.' }
  }

  const db = portalDb({ clientId: ctx.clientId })
  let projectId: string
  try {
    await db`SELECT portal.answer_approval(${id.data}, ${ctx.memberId}, ${parsed.data.decision}, ${parsed.data.body})`
    const rows = await db<{ project_id: string }>`SELECT project_id::text FROM portal.messages WHERE client_id = ${ctx.clientId} AND id = ${id.data}`
    projectId = rows[0].project_id
  } catch (err) {
    switch (pgErrorCode(err)) {
      case 'P0409': return { success: false, error: 'Na tohle už jste odpověděli. Když jste změnili názor, napište zprávu.' }
      case 'P0002': return { success: false, error: 'Tahle zpráva nebyla nalezena.' }
      case 'P0001': return { success: false, error: 'Napište prosím, co chcete změnit.' }
      default:
        console.error('[chat] schválení selhalo:', err instanceof Error ? err.name : 'unknown')
        return { success: false, error: 'Něco se nepovedlo. Zkuste to prosím znovu.' }
    }
  }

  after(() =>
    notifyNewMessage(projectId, 'client', { body: parsed.data.decision === 'approved' ? 'Schvaluji.' : parsed.data.body, attachments: 0 })
      .catch((err: unknown) => console.error('[chat] upozornění selhalo:', err instanceof Error ? err.name : 'unknown')),
  )
  revalidatePath(`/klient/zpravy/${projectId}`)
  return { success: true }
}
