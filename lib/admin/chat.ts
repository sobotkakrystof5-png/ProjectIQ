import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { chatEtag, THREAD_MESSAGES_SQL, THREAD_REQUESTS_SQL, toChatMessages, toThreadSummary } from '@/lib/chat/map'
import type { ChatMessage, ChatReads, ChatThreadSummary } from '@/lib/chat/types'
import { sendBrandedEmail } from '@/lib/email'
import { adminEmail, projectPath } from '@/lib/lead-origins'
import { createNotification } from '@/lib/notifications'
import { sendVizeonMail } from '@/lib/admin/vizeon-mail'
import { SIGNATURE } from '@/lib/admin/meeting-email'

/**
 * Schránka Zprávy v adminu (KP15, R-122, R-123). Čte vlastníkem tabulek přes
 * všechny klienty; text dotazu na vlákno je tentýž jako v klientském prostoru.
 */

export const ADMIN_AUTHOR_NAME = 'Kryštof Sobotka'

export interface AdminThreadInfo {
  projectId: string
  projectName: string
  clientName: string
  status: string
  progress: number
  deadline: string | null
  /** Kdy byl kdokoli z klienta naposledy v prostoru (D-K19, vidí jen admin). */
  clientLastSeen: string | null
}

export interface AdminThread {
  info: AdminThreadInfo
  messages: ChatMessage[]
  reads: ChatReads
}

/** Všechna vlákna propojených zakázek, nejnovější zpráva nahoře. */
export async function listAdminThreads(): Promise<ChatThreadSummary[]> {
  try {
    const rows = await adminDb`
      SELECT p.id::text, p.name, c.name AS client_name,
             lm.author AS last_author, lm.body AS last_body, lm.created_at AS last_at,
             (SELECT count(*)::int FROM portal.message_attachments a WHERE a.message_id = lm.id) AS last_attachments,
             (SELECT count(*)::int FROM portal.messages m
               WHERE m.project_id = p.id AND m.author = 'client'
                 AND m.created_at > COALESCE(ts.last_read_at, '-infinity'::timestamptz)) AS unread
      FROM portal.projects p
      JOIN portal.clients c ON c.id = p.client_id
      LEFT JOIN LATERAL (
        SELECT m.id, m.author, m.body, m.created_at FROM portal.messages m
        WHERE m.project_id = p.id ORDER BY m.created_at DESC LIMIT 1
      ) lm ON true
      LEFT JOIN portal.thread_state ts ON ts.project_id = p.id AND ts.side = 'admin'
      WHERE c.archived_at IS NULL
      ORDER BY COALESCE(lm.created_at, p.updated_at) DESC
      LIMIT 200
    `
    return rows.map((r) => toThreadSummary(r, String(r.client_name)))
  } catch (err) {
    if (missing(err)) return []
    throw err
  }
}

export async function loadAdminThread(projectId: string): Promise<AdminThread | null> {
  const head = await adminDb`
    SELECT p.id::text, p.client_id::text, p.name, p.status, p.progress, p.deadline, c.name AS client_name,
           (SELECT max(t.last_seen_at) FROM portal.thread_state t WHERE t.client_id = p.client_id AND t.side = 'client') AS client_seen
    FROM portal.projects p JOIN portal.clients c ON c.id = p.client_id
    WHERE p.id = ${projectId}
  `
  const h = head[0]
  if (!h) return null
  const clientId = String(h.client_id)
  const [messageRows, requestRows, stateRows] = await adminDb.batch([
    { text: THREAD_MESSAGES_SQL, params: [clientId, projectId] },
    { text: THREAD_REQUESTS_SQL, params: [clientId, projectId] },
    {
      text: `SELECT t.side, t.last_read_at,
                    COALESCE(NULLIF(btrim(m.name), ''), split_part(m.email, '@', 1)) AS reader
             FROM portal.thread_state t LEFT JOIN portal.members m ON m.id = t.last_read_member
             WHERE t.project_id = $1`,
      params: [projectId],
    },
  ])
  const state = (side: string) => stateRows.find((s) => s.side === side)
  const at = (v: unknown) => (v ? new Date(v as string).toISOString() : null)
  return {
    info: {
      projectId,
      projectName: String(h.name),
      clientName: String(h.client_name),
      status: String(h.status),
      progress: Number(h.progress ?? 0),
      deadline: h.deadline ? String(h.deadline).slice(0, 10) : null,
      clientLastSeen: at(h.client_seen),
    },
    messages: toChatMessages(messageRows, requestRows),
    reads: {
      otherReadAt: at(state('client')?.last_read_at),
      otherReaderName: (state('client')?.reader as string | null) ?? null,
      myReadAt: at(state('admin')?.last_read_at),
    },
  }
}

/** Otisk schránky: nová zpráva kdekoli, schválení, přečteno. */
export async function adminChatStamp(): Promise<string> {
  const [messages, reads] = await adminDb.batch([
    { text: `SELECT count(*)::int AS n, max(updated_at) AS u FROM portal.messages`, params: [] },
    { text: `SELECT count(*)::int AS n, max(last_read_at) AS r FROM portal.thread_state`, params: [] },
  ])
  return chatEtag(['admin', messages[0], reads[0]])
}

/** Odznak „Zprávy" v menu: nepřečtené zprávy od klientů. */
export function unreadClientMessagesSql(): string {
  return `
    SELECT count(*)::int AS count FROM portal.messages m
    LEFT JOIN portal.thread_state ts ON ts.project_id = m.project_id AND ts.side = 'admin'
    WHERE m.author = 'client' AND m.created_at > COALESCE(ts.last_read_at, '-infinity'::timestamptz)
  `
}

function missing(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === '42P01' || code === '42703' || code === '3F000'
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

const preview = (body: string, attachments: number) =>
  (body.trim() || (attachments > 0 ? 'Poslal(a) přílohu.' : '')).slice(0, 300)

type Deps = { send?: typeof sendVizeonMail; sendAdmin?: typeof sendBrandedEmail; notify?: typeof createNotification }

/**
 * Upozornění druhé straně po nové zprávě (R-122): e-mail jen když vlákno nemá
 * otevřené (poslední návštěva před víc než minutou) a nejvýš jednou za hodinu
 * — rozhodne `portal_thread_claim_notify` jedním příkazem. Kryštofovi navíc
 * zvonek u každé zprávy klienta. Selhání nic nevrací zpět.
 */
export async function notifyNewMessage(
  projectId: string,
  author: 'client' | 'admin',
  message: { body: string; attachments: number },
  deps: Deps = {},
): Promise<void> {
  const rows = await adminDb`
    SELECT p.name, c.name AS client_name, p.client_id::text FROM portal.projects p
    JOIN portal.clients c ON c.id = p.client_id WHERE p.id = ${projectId}
  `
  const p = rows[0]
  if (!p) return
  const text = preview(message.body, message.attachments)

  if (author === 'client') {
    await (deps.notify ?? createNotification)({
      type: 'client_message',
      title: `Nová zpráva — ${String(p.client_name)} · ${String(p.name)}`,
      body: text,
      link: `/dashboard/zpravy/${projectId}`,
    })
    const [claim] = await adminDb`SELECT portal_thread_claim_notify(${projectId}, 'admin') AS ok`
    const to = adminEmail()
    if (!claim?.ok || !to) return
    await (deps.sendAdmin ?? sendBrandedEmail)({
      to,
      subject: `Nová zpráva od klienta – ${String(p.client_name)}`,
      heading: 'Nová zpráva v klientském prostoru',
      intro: `${String(p.client_name)} napsal(a) u zakázky ${String(p.name)}.`,
      fields: [{ label: 'Zpráva', value: text }],
      ctas: [{ label: 'Otevřít Zprávy', href: `${appUrl()}/dashboard/zpravy/${projectId}` }],
    }).catch((err: unknown) => console.error('[chat] e-mail adminovi neodešel:', err instanceof Error ? err.name : 'unknown'))
    return
  }

  const [claim] = await adminDb`SELECT portal_thread_claim_notify(${projectId}, 'client') AS ok`
  if (!claim?.ok) return
  const members = await adminDb<{ email: string }>`
    SELECT DISTINCT lower(email) AS email FROM portal.members
    WHERE client_id = ${String(p.client_id)} AND removed_at IS NULL AND email IS NOT NULL
  `
  const link = `${appUrl()}/klient/zpravy/${projectId}`
  const plain = ['Dobrý den,', '', `u zakázky ${String(p.name)} máte novou zprávu:`, '', text, '', `Odpovědět můžete tady: ${link}`, '', ...SIGNATURE].join('\n')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const html = `<!doctype html><html lang="cs"><body style="margin:0;padding:24px;font-family:'Instrument Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0c1a36">
<div style="max-width:560px"><p>Dobrý den,</p><p>u zakázky ${esc(String(p.name))} máte novou zprávu:</p>
<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #dce7f7;white-space:pre-wrap">${esc(text)}</blockquote>
<p><a href="${esc(link)}" style="display:inline-block;background:#23478b;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Otevřít zprávy</a></p>
<p style="margin-top:18px">${SIGNATURE.map(esc).join('<br>')}</p></div></body></html>`
  for (const m of members) {
    const res = await (deps.send ?? sendVizeonMail)({
      to: m.email,
      subject: `Nová zpráva k zakázce ${String(p.name)}`.slice(0, 150),
      text: plain,
      html,
    }).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : 'unknown' }))
    if (!res.ok) console.error('[chat] e-mail klientovi neodešel:', res.error)
  }
}

/**
 * Smaže z úložiště soubory příloh, jejichž řádek zmizel — retencí (R-076),
 * rozpojením zakázky nebo výmazem (fronta `storage_deletions`, migrace 124).
 * Denní cron `client-retention`. Bez úložiště nebo migrace nic nedělá.
 */
export async function purgeDeletedAttachments(
  deleteFiles: (paths: string[]) => Promise<void>,
  configured: boolean,
): Promise<number> {
  if (!configured) return 0
  let rows: { path: string }[]
  try {
    rows = await adminDb<{ path: string }>`SELECT path FROM storage_deletions WHERE bucket = 'chat-prilohy' ORDER BY queued_at LIMIT 500`
  } catch (err) {
    if (missing(err)) return 0
    throw err
  }
  if (rows.length === 0) return 0
  const paths = rows.map((r) => r.path)
  await deleteFiles(paths)
  await adminDb`DELETE FROM storage_deletions WHERE path = ANY(${paths}::text[])`
  return paths.length
}
