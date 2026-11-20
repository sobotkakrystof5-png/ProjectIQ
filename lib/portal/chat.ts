import 'server-only'
import { chatEtag, THREAD_MESSAGES_SQL, THREAD_REQUESTS_SQL, toChatMessages, toThreadSummary } from '@/lib/chat/map'
import type { ChatMessage, ChatReads, ChatThreadSummary } from '@/lib/chat/types'
import { portalDb, pq } from './db'

// Chat v klientském prostoru (KP15, migrace 124). Vše přes portalDb(clientId)
// — RLS a výslovný filtr client_id. Ze stavu vlákna se čte jen „přečteno",
// kdy byl admin naposledy aktivní, role portal_app ani nesmí (D-K19).

export interface ClientThread {
  messages: ChatMessage[]
  reads: ChatReads
}

/** Zakázky klienta jako kanály: poslední zpráva a kolik nepřečtených od Kryštofa. */
export async function listClientThreads(clientId: string): Promise<ChatThreadSummary[]> {
  const rows = await portalDb({ clientId })`
    SELECT p.id::text, p.name,
           lm.author AS last_author, lm.body AS last_body, lm.created_at AS last_at,
           (SELECT count(*)::int FROM portal.message_attachments a WHERE a.client_id = p.client_id AND a.message_id = lm.id) AS last_attachments,
           (SELECT count(*)::int FROM portal.messages m
             WHERE m.client_id = p.client_id AND m.project_id = p.id AND m.author = 'admin'
               AND m.created_at > COALESCE(ts.last_read_at, '-infinity'::timestamptz)) AS unread
    FROM portal.projects p
    LEFT JOIN LATERAL (
      SELECT m.id, m.author, m.body, m.created_at FROM portal.messages m
      WHERE m.client_id = p.client_id AND m.project_id = p.id
      ORDER BY m.created_at DESC LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT t.last_read_at FROM portal.thread_state t
      WHERE t.client_id = p.client_id AND t.project_id = p.id AND t.side = 'client'
    ) ts ON true
    WHERE p.client_id = ${clientId}
    ORDER BY COALESCE(lm.created_at, p.updated_at) DESC
  `
  return rows.map((r) => toThreadSummary(r))
}

export async function loadClientThread(clientId: string, projectId: string): Promise<ClientThread> {
  const [messageRows, requestRows, stateRows] = await portalDb({ clientId }).batch([
    { text: THREAD_MESSAGES_SQL, params: [clientId, projectId] },
    { text: THREAD_REQUESTS_SQL, params: [clientId, projectId] },
    pq`SELECT side, last_read_at FROM portal.thread_state WHERE client_id = ${clientId} AND project_id = ${projectId}`,
  ])
  const readOf = (side: string) => {
    const at = stateRows.find((s) => s.side === side)?.last_read_at
    return at ? new Date(at as string).toISOString() : null
  }
  return {
    messages: toChatMessages(messageRows, requestRows),
    reads: { otherReadAt: readOf('admin'), otherReaderName: null, myReadAt: readOf('client') },
  }
}

/** Otisk všech vláken klienta pro živé obnovení (nové zprávy, schválení, přečteno). */
export async function clientChatStamp(clientId: string): Promise<string> {
  const [messages, reads] = await portalDb({ clientId }).batch([
    pq`SELECT count(*)::int AS n, max(updated_at) AS u FROM portal.messages WHERE client_id = ${clientId}`,
    pq`SELECT project_id::text, side, last_read_at FROM portal.thread_state WHERE client_id = ${clientId} ORDER BY project_id, side`,
  ])
  return chatEtag([clientId, messages[0], reads])
}

/** Počet nepřečtených zpráv přes všechna vlákna (titulek karty, odznak). */
export function totalUnread(threads: ChatThreadSummary[]): number {
  return threads.reduce((sum, t) => sum + t.unread, 0)
}
