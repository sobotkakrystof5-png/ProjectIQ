import { after, NextResponse, type NextRequest } from 'next/server'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { notifyNewMessage } from '@/lib/admin/chat'
import { chatDbError, chatFail, chatFieldsSchema, readChatForm, sameOrigin } from '@/lib/chat/http'
import { chatStorageConfigured, deleteStoredFiles, prepareFiles, uploadFiles } from '@/lib/chat/storage'
import { getPortalContext } from '@/lib/portal/context'
import { portalDb } from '@/lib/portal/db'

// Zpráva klienta do chatu u zakázky (KP15, R-122): text, přepsaný hlas
// a nejvýš pět obrázků nebo PDF. Člen se bere ze session, zakázku, limity
// i složku přílohy ověřuje `portal.post_message`. Soubory jdou do úložiště
// až po kontrole typu podle obsahu; když zápis zprávy selže, smažou se.

export const maxDuration = 60

const WINDOW_MINUTES = 10
const MAX_REQUESTS = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!sameOrigin(req)) return chatFail(403, 'Neplatný požadavek.')
  const ctx = await getPortalContext()
  if (!ctx) return chatFail(401, 'Přihlaste se prosím znovu.')

  const endpoint = `klient-zpravy:${ctx.memberId}`
  if (await isApiRateLimited(endpoint, 'member', WINDOW_MINUTES, MAX_REQUESTS)) {
    return chatFail(429, 'Posíláte hodně zpráv za sebou. Zkuste to prosím za chvíli.')
  }
  await recordApiRequest(endpoint, 'member')

  const form = await readChatForm(req)
  if (!form) return chatFail(413, 'Zpráva nebo soubory jsou moc velké.')
  const parsed = chatFieldsSchema.safeParse(form.fields)
  if (!parsed.success) return chatFail(400, parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím zprávu.')
  const { projectId, body, replyTo } = parsed.data
  const kind = parsed.data.kind === 'voice' ? 'voice' : 'text'

  const db = portalDb({ clientId: ctx.clientId })
  const own = await db`SELECT 1 FROM portal.projects WHERE client_id = ${ctx.clientId} AND id = ${projectId}`
  if (own.length === 0) return chatFail(404, 'Tahle zakázka nebyla nalezena.')

  const hasFiles = form.files.some((f) => typeof f !== 'string' && f.size > 0)
  if (hasFiles && !chatStorageConfigured()) return chatFail(503, 'Soubory teď poslat nejde. Napište prosím text.')
  const prepared = await prepareFiles(form.files, ctx.clientId, projectId)
  if (!prepared.ok) return chatFail(400, prepared.error)

  try {
    await uploadFiles(prepared.files)
  } catch (err) {
    console.error('[chat] nahrání souboru selhalo:', err instanceof Error ? err.message : 'unknown')
    return chatFail(502, 'Soubor se nepodařilo nahrát. Zkuste to prosím znovu.')
  }

  const attachments = prepared.files.map((f) => ({ id: f.id, path: f.path, mime: f.mime, size: f.size, filename: f.filename }))
  let id: string
  try {
    const rows = await db<{ id: string }>`
      SELECT portal.post_message(${projectId}, ${ctx.memberId}, ${kind}, ${body}, ${replyTo ?? null}, ${JSON.stringify(attachments)}::jsonb)::text AS id
    `
    id = String(rows[0].id)
  } catch (err) {
    await deleteStoredFiles(prepared.files.map((f) => f.path)).catch(() => {})
    const { status, error } = chatDbError(err)
    return chatFail(status, error)
  }

  after(() =>
    notifyNewMessage(projectId, 'client', { body, attachments: attachments.length }).catch((err: unknown) =>
      console.error('[chat] upozornění selhalo:', err instanceof Error ? err.name : 'unknown'),
    ),
  )
  return NextResponse.json({ success: true, id })
}
