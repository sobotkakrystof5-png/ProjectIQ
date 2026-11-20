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
import { adminEmail, projectPath } from '@/lib/lead-origins'
import { clientRequestSchema, REQUEST_KIND_LABELS } from '@/lib/client-requests'
import { summarizeClientRequest } from '@/lib/client-request-ai'
import { finishConsultationBooking, finishConsultationCancel, finishConsultationMove } from '@/lib/admin/consultations'
import { loadClientConsultation } from '@/lib/portal/consultations'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'

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

interface ProjectInfo { client_name: string; description: string | null; focus: string | null }

/** Údaje o zakázce pro upozornění adminovi (lib/db, vlastník tabulek). */
async function adminProjectInfo(projectId: string): Promise<ProjectInfo | null> {
  const rows = await sql`SELECT client_name, description, focus FROM projects WHERE id = ${projectId} LIMIT 1`
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
    const to = adminEmail()
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
      link: `${projectPath(id.data)}?zalozka=zpravy`,
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
      link: projectPath(id.data),
    })
  }
  revalidatePath(`/klient/projekt/${id.data}`)
  return { success: true }
}

const taskStateSchema = z.object({ taskId: z.string().uuid(), done: z.boolean() })

/**
 * „Mám hotovo" u úkolu etapy (KP12). Úkol, zakázku i členství ověřuje
 * `portal.submit_task_state`; Kryštofovi přijde zvonek, jen když se úkol
 * opravdu označil (ne při vrácení ani při druhém kliknutí).
 */
export async function setTaskDone(projectId: string, raw: { taskId: string; done: boolean }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = projectIdSchema.safeParse(projectId)
  const parsed = taskStateSchema.safeParse(raw)
  if (!id.success || !parsed.success) return { success: false, error: 'Tenhle úkol nebyl nalezen.' }

  let changed = false
  let taskProject: string | null = null
  try {
    const rows = await portalDb({ clientId: ctx.clientId })<{ task_project: string; changed: boolean }>`
      SELECT * FROM portal.submit_task_state(${parsed.data.taskId}, ${ctx.memberId}, ${parsed.data.done})
    `
    changed = Boolean(rows[0]?.changed)
    taskProject = rows[0]?.task_project ? String(rows[0].task_project) : null
  } catch (err) {
    return { success: false, error: explain(err, 'Úkoly jste měnili hodně často. Zkuste to prosím za chvíli.') }
  }
  // Úkol z jiné zakázky téhož klienta: funkce ho pustí (patří klientovi),
  // ale odkaz a obnovení stránky musí sedět na skutečnou zakázku.
  const project = taskProject ?? id.data

  if (changed && parsed.data.done) {
    const info = await adminProjectInfo(project)
    if (info) {
      await createNotification({
        type: 'client_task_done',
        title: `Klient splnil úkol — ${info.client_name}`,
        body: 'Úkol z etapy je v klientském prostoru označený jako hotový.',
        link: `${projectPath(project)}#etapy`,
      })
    }
  }
  revalidatePath(`/klient/projekt/${project}`)
  return { success: true }
}

// ─── Konzultace z volna (KP14, R-126) ─────────────────────────────────────────
//
// Čas, zakázku, členství, lhůtu 24 h i kolize ověřují databázové funkce
// portal.book_/move_/cancel_consultation pod zámkem. Google Meet, potvrzení
// e-mailem a zvonek doběhnou po odpovědi klientovi (`after`) a jejich selhání
// rezervaci nezruší. Do vlastnické části jde jen id, které vrátila databáze.

const consultationIdSchema = z.string().uuid()
const startsAtSchema = z.iso.datetime({ offset: true })
const bookSchema = z.object({
  startsAt: startsAtSchema,
  topic: z.string().trim().min(3, 'Napište prosím pár slov, o čem se chcete bavit.').max(1000, 'Popis může mít nejvýše 1000 znaků.'),
})

const SLOT_TAKEN = 'Tenhle čas si mezitím někdo vzal. Vyberte prosím jiný.'

// Každý pokus (i neúspěšný) bere zámek rezervací a počítá volné časy, takže
// se počítají všechny, ne jen uložené rezervace (bezpečnostní kontrola KP14).
const ATTEMPT_WINDOW_MINUTES = 10
const ATTEMPT_MAX = 30
const TOO_MANY_ATTEMPTS = 'Zkoušíte to hodně často. Počkejte prosím pár minut.'

async function tooManyAttempts(memberId: string): Promise<boolean> {
  const endpoint = `klient-konzultace:${memberId}`
  if (await isApiRateLimited(endpoint, 'member', ATTEMPT_WINDOW_MINUTES, ATTEMPT_MAX)) return true
  await recordApiRequest(endpoint, 'member')
  return false
}

function explainConsultation(err: unknown, limitMessage: string): string {
  switch (pgErrorCode(err)) {
    case '23P01':
    case '23505': return SLOT_TAKEN
    case 'P0422': return 'Konzultaci za méně než 24 hodin už tady změnit nejde. Napište mi prosím zprávu.'
    case 'P0429': return limitMessage
    case 'P0002': return 'Tahle konzultace nebyla nalezena.'
    case 'P0001': return 'Zkontrolujte prosím čas a popis.'
    default:
      console.error('[klient] chyba konzultace:', err instanceof Error ? err.name : 'unknown')
      return GENERIC
  }
}

export async function bookConsultation(projectId: string, raw: { startsAt: string; topic: string }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = projectIdSchema.safeParse(projectId)
  const parsed = bookSchema.safeParse(raw)
  if (!id.success) return { success: false, error: 'Tenhle projekt nebyl nalezen.' }
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím čas a popis.' }
  if (await tooManyAttempts(ctx.memberId)) return { success: false, error: TOO_MANY_ATTEMPTS }

  let slotId: string
  try {
    const rows = await portalDb({ clientId: ctx.clientId })<{ id: string }>`
      SELECT portal.book_consultation(${id.data}, ${ctx.memberId}, ${parsed.data.startsAt}, ${parsed.data.topic}) AS id
    `
    slotId = String(rows[0].id)
  } catch (err) {
    return { success: false, error: explainConsultation(err, 'Rezervovali jste hodně konzultací za sebou. Zkuste to prosím za chvíli.') }
  }

  after(() => finishConsultationBooking(slotId).catch((err) =>
    console.error('[klient] dokončení rezervace selhalo:', err instanceof Error ? err.name : 'unknown'),
  ))
  revalidatePath(`/klient/projekt/${id.data}`)
  return { success: true }
}

export async function moveConsultation(consultationId: string, raw: { startsAt: string }): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = consultationIdSchema.safeParse(consultationId)
  const startsAt = startsAtSchema.safeParse(raw.startsAt)
  if (!id.success) return { success: false, error: 'Tahle konzultace nebyla nalezena.' }
  if (!startsAt.success) return { success: false, error: 'Vyberte prosím nový čas.' }
  if (await tooManyAttempts(ctx.memberId)) return { success: false, error: TOO_MANY_ATTEMPTS }

  const before = await loadClientConsultation(ctx.clientId, id.data)
  if (!before) return { success: false, error: 'Tahle konzultace nebyla nalezena.' }

  let moved: { googleEventId: string | null; minutes: number }
  try {
    const rows = await portalDb({ clientId: ctx.clientId })<{ google_event_id: string | null; minutes: number }>`
      SELECT * FROM portal.move_consultation(${id.data}, ${ctx.memberId}, ${startsAt.data})
    `
    moved = { googleEventId: rows[0]?.google_event_id ?? null, minutes: Number(rows[0]?.minutes ?? 30) }
  } catch (err) {
    return { success: false, error: explainConsultation(err, 'Tuhle konzultaci jste už několikrát přesunuli. Napište mi prosím zprávu.') }
  }

  after(() => finishConsultationMove(id.data, moved).catch((err) =>
    console.error('[klient] dokončení přesunu selhalo:', err instanceof Error ? err.name : 'unknown'),
  ))
  revalidatePath(`/klient/projekt/${before.projectId}`)
  return { success: true }
}

export async function cancelConsultation(consultationId: string): Promise<ActionResult> {
  const ctx = await getPortalContext()
  if (!ctx) return { success: false, error: 'Přihlaste se prosím znovu.' }
  const id = consultationIdSchema.safeParse(consultationId)
  if (!id.success) return { success: false, error: 'Tahle konzultace nebyla nalezena.' }
  if (await tooManyAttempts(ctx.memberId)) return { success: false, error: TOO_MANY_ATTEMPTS }

  const before = await loadClientConsultation(ctx.clientId, id.data)
  if (!before) return { success: false, error: 'Tahle konzultace nebyla nalezena.' }

  let googleEventId: string | null
  try {
    const rows = await portalDb({ clientId: ctx.clientId })<{ google_event_id: string | null }>`
      SELECT portal.cancel_consultation(${id.data}, ${ctx.memberId}) AS google_event_id
    `
    googleEventId = rows[0]?.google_event_id ?? null
  } catch (err) {
    return { success: false, error: explainConsultation(err, GENERIC) }
  }

  const info = await adminProjectInfo(before.projectId)
  after(() => finishConsultationCancel({
    googleEventId,
    projectId: before.projectId,
    clientName: info?.client_name ?? ctx.clientName,
    startsAt: before.startsAt,
  }).catch((err) => console.error('[klient] dokončení zrušení selhalo:', err instanceof Error ? err.name : 'unknown')))
  revalidatePath(`/klient/projekt/${before.projectId}`)
  return { success: true }
}
