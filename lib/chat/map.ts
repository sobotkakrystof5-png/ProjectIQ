import { createHash } from 'node:crypto'
import type { ChatAttachment, ChatAuthor, ChatKind, ChatMessage, ChatThreadSummary } from '@/lib/chat/types'

/**
 * Společné SQL a převod řádků chatu (KP15). Klientský prostor čte rolí
 * `portal_app` (RLS + výslovný filtr `client_id`), admin vlastníkem tabulek —
 * text dotazu je tentýž, liší se jen spojení.
 */

/** Zprávy jednoho vlákna, nejnovější první ($1 = client_id, $2 = project_id). */
export const THREAD_MESSAGES_SQL = `
  SELECT m.id::text, m.author, m.author_name, m.kind, m.body, m.created_at,
         m.approval_state, m.approval_url, m.request_status,
         r.id::text AS reply_id, r.author_name AS reply_author, left(r.body, 200) AS reply_body,
         COALESCE((
           SELECT json_agg(json_build_object('id', a.id, 'mime', a.mime, 'filename', a.filename, 'size', a.size_bytes)
                           ORDER BY a.created_at)
           FROM portal.message_attachments a WHERE a.client_id = m.client_id AND a.message_id = m.id
         ), '[]'::json) AS attachments
  FROM portal.messages m
  LEFT JOIN portal.messages r ON r.client_id = m.client_id AND r.id = m.reply_to
  WHERE m.client_id = $1 AND m.project_id = $2
  ORDER BY m.created_at DESC
  LIMIT 300
`

/** Staré požadavky z doby před chatem (KP07) — ve vlákně jako zprávy klienta (D-K17). */
export const THREAD_REQUESTS_SQL = `
  SELECT id::text, body, status, created_at FROM portal.requests
  WHERE client_id = $1 AND project_id = $2 ORDER BY created_at DESC LIMIT 100
`

const iso = (v: unknown): string => new Date(v as string).toISOString()
const KINDS = new Set(['text', 'voice', 'approval', 'approval_answer'])
const APPROVAL = new Set(['pending', 'approved', 'changes'])
const REQUEST = new Set(['new', 'done', 'dismissed'])

function attachmentsOf(raw: unknown): ChatAttachment[] {
  const list = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  if (!Array.isArray(list)) return []
  return list.map((a: Record<string, unknown>) => ({
    id: String(a.id),
    mime: String(a.mime),
    filename: String(a.filename),
    size: Number(a.size),
  }))
}

export function toChatMessages(messageRows: Record<string, unknown>[], requestRows: Record<string, unknown>[] = []): ChatMessage[] {
  const messages: ChatMessage[] = messageRows.map((r) => ({
    id: String(r.id),
    author: (r.author === 'admin' ? 'admin' : 'client') as ChatAuthor,
    authorName: (r.author_name as string | null) ?? null,
    kind: (KINDS.has(String(r.kind)) ? r.kind : 'text') as ChatKind,
    body: String(r.body ?? ''),
    createdAt: iso(r.created_at),
    replyTo: r.reply_id
      ? { id: String(r.reply_id), authorName: (r.reply_author as string | null) ?? null, body: String(r.reply_body ?? '') }
      : null,
    approvalState: APPROVAL.has(String(r.approval_state)) ? (r.approval_state as ChatMessage['approvalState']) : null,
    approvalUrl: typeof r.approval_url === 'string' && r.approval_url.startsWith('https://') ? r.approval_url : null,
    requestStatus: REQUEST.has(String(r.request_status)) ? (r.request_status as ChatMessage['requestStatus']) : null,
    attachments: attachmentsOf(r.attachments),
  }))
  const requests: ChatMessage[] = requestRows.map((r) => ({
    id: `pozadavek-${String(r.id)}`,
    author: 'client',
    authorName: null,
    kind: 'request',
    body: String(r.body ?? ''),
    createdAt: iso(r.created_at),
    replyTo: null,
    approvalState: null,
    approvalUrl: null,
    requestStatus: REQUEST.has(String(r.status)) ? (r.status as ChatMessage['requestStatus']) : null,
    attachments: [],
  }))
  return [...messages, ...requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function toThreadSummary(r: Record<string, unknown>, subtitle: string | null = null): ChatThreadSummary {
  const hasLast = r.last_at != null
  const attachments = Number(r.last_attachments ?? 0)
  return {
    projectId: String(r.id),
    title: String(r.name),
    subtitle,
    lastMessage: hasLast
      ? {
          author: r.last_author === 'admin' ? 'admin' : 'client',
          body: String(r.last_body ?? '') || (attachments > 0 ? 'Příloha' : ''),
          createdAt: iso(r.last_at),
        }
      : null,
    unread: Number(r.unread ?? 0),
  }
}

/** Otisk pro živé obnovení: beze změny 304, se změnou prohlížeč načte znovu. */
export function chatEtag(parts: unknown[]): string {
  return `"${createHash('sha256').update(JSON.stringify(parts)).digest('base64url').slice(0, 22)}"`
}
