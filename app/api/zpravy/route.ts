import { after, NextResponse, type NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { adminDb } from '@/lib/admin/db'
import { ADMIN_AUTHOR_NAME, notifyNewMessage } from '@/lib/admin/chat'
import { chatDbError, chatFail, chatFieldsSchema, readChatForm, sameOrigin } from '@/lib/chat/http'
import { chatStorageConfigured, deleteStoredFiles, prepareFiles, uploadFiles } from '@/lib/chat/storage'

// Odpověď Kryštofa ve schránce Zprávy (KP15, R-122): text, hlas, zpráva ke
// schválení s odkazem na náhled a přílohy. Zapisuje `portal_admin_post`
// vlastníkem tabulek; klient dostane e-mail, jen když chat nemá otevřený.

export const maxDuration = 60

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return chatFail(401, 'Přihlaste se prosím znovu.')
  if (!sameOrigin(req)) return chatFail(403, 'Neplatný požadavek.')

  const form = await readChatForm(req)
  if (!form) return chatFail(413, 'Zpráva nebo soubory jsou moc velké.')
  const parsed = chatFieldsSchema.safeParse(form.fields)
  if (!parsed.success) return chatFail(400, parsed.error.issues[0]?.message ?? 'Zkontrolujte prosím zprávu.')
  const { projectId, kind, body, replyTo } = parsed.data
  const approvalUrl = kind === 'approval' ? (parsed.data.approvalUrl ?? null) : null

  const linked = await adminDb<{ client_id: string }>`SELECT client_id::text FROM portal.projects WHERE id = ${projectId}`
  const clientId = linked[0]?.client_id
  if (!clientId) return chatFail(404, 'Zakázka není propojená s klientským prostorem.')

  const hasFiles = form.files.some((f) => typeof f !== 'string' && f.size > 0)
  if (hasFiles && !chatStorageConfigured()) return chatFail(503, 'Úložiště příloh není nastavené (SUPABASE_SERVICE_ROLE_KEY).')
  const prepared = await prepareFiles(form.files, clientId, projectId)
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
    const rows = await adminDb<{ id: string }>`
      SELECT portal_admin_post(${projectId}, ${kind}, ${body}, ${replyTo ?? null}, ${approvalUrl},
                               ${JSON.stringify(attachments)}::jsonb, ${ADMIN_AUTHOR_NAME})::text AS id
    `
    id = String(rows[0].id)
  } catch (err) {
    await deleteStoredFiles(prepared.files.map((f) => f.path)).catch(() => {})
    const { status, error } = chatDbError(err)
    return chatFail(status, error)
  }

  after(() =>
    notifyNewMessage(projectId, 'admin', { body, attachments: attachments.length }).catch((err: unknown) =>
      console.error('[chat] upozornění klienta selhalo:', err instanceof Error ? err.name : 'unknown'),
    ),
  )
  return NextResponse.json({ success: true, id })
}
