/**
 * Tvar zpráv chatu s klientem (KP15, R-122). Sdílí ho klientský prostor
 * i schránka Zprávy v adminu — jedna komponenta vlákna pro obě strany.
 */

export type ChatAuthor = 'client' | 'admin'
export type ChatKind = 'text' | 'voice' | 'approval' | 'approval_answer' | 'request'

export interface ChatAttachment {
  id: string
  mime: string
  filename: string
  size: number
}

export interface ChatMessage {
  id: string
  author: ChatAuthor
  authorName: string | null
  kind: ChatKind
  body: string
  createdAt: string
  replyTo: { id: string; authorName: string | null; body: string } | null
  approvalState: 'pending' | 'approved' | 'changes' | null
  approvalUrl: string | null
  /** Stav zadání pro Claude Code udělaného z téhle zprávy (R-069). */
  requestStatus: 'new' | 'done' | 'dismissed' | null
  attachments: ChatAttachment[]
}

export interface ChatReads {
  /** Kdy si druhá strana naposledy přečetla vlákno (dvě fajfky). */
  otherReadAt: string | null
  /** Kdo z klienta četl (vidí jen admin). */
  otherReaderName: string | null
  /** Kde je čára „Nové zprávy" — moje poslední přečtení při otevření. */
  myReadAt: string | null
}

export interface ChatThreadSummary {
  projectId: string
  title: string
  subtitle: string | null
  lastMessage: { author: ChatAuthor; body: string; createdAt: string } | null
  unread: number
}

export const REQUEST_STATUS_CHAT: Record<'new' | 'done' | 'dismissed', string> = {
  new: 'Přijato',
  done: 'Hotovo',
  dismissed: 'Uzavřeno',
}

export const CHAT_MAX_FILES = 5
/**
 * Vercel přijme do funkce tělo požadavku nejvýš ~4,5 MB, proto 4 MB na celé
 * odeslání (všechny soubory dohromady). Větší fotky prohlížeč před odesláním
 * zmenší (`shrinkImage`), PDF nad limit nejde poslat.
 */
export const CHAT_MAX_FILE_BYTES = 4 * 1024 * 1024
export const CHAT_MAX_TOTAL_BYTES = 4 * 1024 * 1024
export const CHAT_MAX_BODY = 2000
