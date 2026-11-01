'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { getPortalContext } from '@/lib/portal/context'
import { portalDb } from '@/lib/portal/db'
import { pgErrorCode } from '@/lib/ws/db'
import { sendBrandedEmail } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import { adminEmailFor, projectPath, toBusiness } from '@/lib/business'
import { clientRequestSchema, REQUEST_KIND_LABELS } from '@/lib/client-requests'
import { summarizeClientRequest } from '@/lib/client-request-ai'

// Akce klienta v klientském prostoru (KP07). Člen se bere ze session
// (getPortalContext), nikdy z formuláře; zakázku, členství i limity znovu
// ověřují databázové funkce portal.submit_*. Chyba databáze se překládá na
// českou hlášku, detaily se neukazují.

type ActionResult = { success: boolean; error?: string }

const projectIdSchema = z.string().uuid()
const messageSchema = z.object({ body: z.string().trim().min(1, 'Napište prosím zprávu.').max(2000, 'Zpráva může mít nejvýše 2000 znaků.') })
const feedbackSchema = z.object({
  nps: z.number().int().min(1).max(10),
  content: z.string().trim().max(2000, 'Komentář může mít nejvýše 2000 znaků.').optional(),
})

const GENERIC = 'Něco se nepovedlo. Zkuste to prosím znovu.'

function explain(err: unknown, limitMessage: string): string {
  switch (pgErrorCode(err)) {
    case 'P0429': return limitMessage
    case 'P0002': return 'Tenhle projekt nebyl nalezen.'
    case 'P0409': return 'Hodnocení jste už poslali. Děkujeme.'
    case 'P0422': return 'Hodnotit můžete, až bude projekt hotový.'
    case 'P0001': return 'Zkontrolujte prosím text.'
    default:
      console.error('[klient] chyba databáze:', err instanceof Error ? err.name : 'unknown')
      return GENERIC
  }
}

interface ProjectInfo { client_name: string; description: string | null; focus: string | null; business: string }

/** Údaje o zakázce pro upozornění adminovi (lib/db, vlastník tabulek). */
async function adminProjectInfo(projectId: string): Promise<ProjectInfo | null> {
  const rows = await sql`SELECT client_name, description, focus, business FROM projects WHERE id = ${projectId} LIMIT 1`
  return (rows[0] as ProjectInfo | undefined) ?? null
}

export async function sendRequest(projectId: string, raw: { text: string; source: 'text' | 'voice' }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = projectIdSchema.safeParse(projectId)
  const parsed = clientRequestSchema.safeParse(raw)
  if (!id.success) return { success: false, error: 'Tenhle projekt nebyl nalezen.' }
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím text.' }

  let adminRequestId: string
  try {
    const rows = await portalDb({ clientId: ctx.clientId })<{ id: string; admin_request_id: string }>`
      SELECT * FROM portal.submit_request(${id.data}, ${ctx.memberId}, ${parsed.data.source}, ${parsed.data.text})
    `
    adminRequestId = String(rows[0].admin_request_id)
  } catch (err) {
    return { success: false, error: explain(err, 'Poslali jste hodně požadavků v krátkém čase. Zkuste to prosím později.') }
  }

  const info = await adminProjectInfo(id.data)
  revalidatePath(`/klient/projekt/${id.data}`)
  revalidatePath('/dashboard/pozadavky')
  if (!info) return { success: true }
  const business = toBusiness(info.business)

  void createNotification({
    type: 'client_request_received',
    title: `Nový požadavek od klienta — ${info.client_name}`,
    body: parsed.data.text.slice(0, 200),
    link: '/dashboard/pozadavky',
  })

  // Shrnutí od AI běží po odpovědi klientovi a jeho selhání nic neruší.
  after(async () => {
    const ai = await summarizeClientRequest({
      text: parsed.data.text,
      clientName: info.client_name,
      description: info.description,
      focus: info.focus,
    })
    try {
      if (ai.data) {
        await sql`
          UPDATE client_requests
          SET ai_status = 'ready', ai_kind = ${ai.data.kind}, ai_summary = ${ai.data.summary},
              ai_prompt = ${ai.data.prompt}, ai_unclear = ${ai.data.unclear}
          WHERE id = ${adminRequestId}
        `
      } else {
        await sql`UPDATE client_requests SET ai_status = 'failed' WHERE id = ${adminRequestId}`
      }
    } catch (err) {
      console.error('[klient] uložení shrnutí selhalo:', err instanceof Error ? err.name : 'unknown')
    }
    const to = adminEmailFor(business)
    if (to) {
      await sendBrandedEmail({
        to,
        subject: `Nový požadavek od klienta – ${info.client_name}`,
        heading: 'Nový požadavek od klienta',
        intro: `Klient ${info.client_name} poslal požadavek z klientského prostoru. Zadání pro Claude Code najdete v administraci.`,
        fields: [
          { label: 'Klient', value: info.client_name },
          ...(ai.data
            ? [
                { label: 'Druh', value: REQUEST_KIND_LABELS[ai.data.kind] },
                { label: 'Shrnutí', value: ai.data.summary },
              ]
            : [{ label: 'Text klienta', value: parsed.data.text }]),
        ],
        ctas: [{ label: 'Otevřít požadavky', href: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/pozadavky` }],
        business,
      })
    }
  })

  return { success: true }
}

export async function sendMessage(projectId: string, raw: { body: string }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = projectIdSchema.safeParse(projectId)
  const parsed = messageSchema.safeParse(raw)
  if (!id.success) return { success: false, error: 'Tenhle projekt nebyl nalezen.' }
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím text.' }

  try {
    await portalDb({ clientId: ctx.clientId })`SELECT portal.submit_message(${id.data}, ${ctx.memberId}, ${parsed.data.body})`
  } catch (err) {
    return { success: false, error: explain(err, 'Poslali jste hodně zpráv. Zkuste to prosím za chvíli.') }
  }

  const info = await adminProjectInfo(id.data)
  if (info) {
    void createNotification({
      type: 'client_request_received',
      title: `Nová zpráva od klienta — ${info.client_name}`,
      body: parsed.data.body.slice(0, 200),
      link: `${projectPath(toBusiness(info.business), id.data)}?zalozka=zpravy`,
    })
  }
  revalidatePath(`/klient/projekt/${id.data}`)
  return { success: true }
}

export async function sendFeedback(projectId: string, raw: { nps: number; content?: string }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = projectIdSchema.safeParse(projectId)
  const parsed = feedbackSchema.safeParse(raw)
  if (!id.success) return { success: false, error: 'Tenhle projekt nebyl nalezen.' }
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím hodnocení.' }

  try {
    await portalDb({ clientId: ctx.clientId })`
      SELECT portal.submit_feedback(${id.data}, ${ctx.memberId}, ${parsed.data.nps}, ${parsed.data.content ?? null})
    `
  } catch (err) {
    return { success: false, error: explain(err, GENERIC) }
  }

  const info = await adminProjectInfo(id.data)
  if (info) {
    void createNotification({
      type: 'feedback_submitted',
      title: `Nové hodnocení od klienta — ${info.client_name}`,
      body: `NPS: ${parsed.data.nps}/10${parsed.data.content ? ' · ' + parsed.data.content : ''}`,
      link: projectPath(toBusiness(info.business), id.data),
    })
  }
  revalidatePath(`/klient/projekt/${id.data}`)
  return { success: true }
}
