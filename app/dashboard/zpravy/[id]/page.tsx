import { requireAdminPage } from '@/lib/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { z } from 'zod'
import { listAdminThreads, loadAdminThread } from '@/lib/admin/chat'
import { AdminInbox, AdminThreadAside } from '@/components/admin/chat/inbox'
import { ChatThread } from '@/components/chat/chat-thread'
import { isTranscriptionConfigured } from '@/lib/transcribe'
import { makeRequestFromMessages } from '../actions'

export const metadata: Metadata = { title: 'Zprávy' }

// Konverzace s klientem u jedné zakázky (KP15). Odpověď textem, hlasem,
// s přílohou nebo ke schválení; z vybraných zpráv klienta zadání pro Claude Code.
export default async function ZpravyThreadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const [threads, thread] = await Promise.all([listAdminThreads(), loadAdminThread(id)])
  if (!thread) notFound()

  return (
    <AdminInbox threads={threads} activeId={id} aside={<AdminThreadAside info={thread.info} />}>
      <header className="flex items-center gap-2 border-b border-navy-100 bg-surface px-2 py-2 sm:px-4">
        <Link href="/dashboard/zpravy" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 lg:hidden" aria-label="Zpět na zprávy">
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">{thread.info.clientName}</h2>
          <p className="truncate text-xs text-quiet">{thread.info.projectName}</p>
        </div>
        <Link href={`/dashboard/${id}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-quiet hover:bg-navy-50 xl:hidden" aria-label="Otevřít zakázku">
          <ExternalLink size={18} strokeWidth={1.5} />
        </Link>
      </header>
      <ChatThread
        viewer="admin"
        projectId={id}
        messages={thread.messages}
        reads={thread.reads}
        sendUrl="/api/zpravy"
        attachmentBase="/api/zpravy/prilohy"
        transcribeUrl={isTranscriptionConfigured() ? '/api/ai-assistant/prepis' : null}
        otherName={thread.info.clientName}
        onMakeRequest={makeRequestFromMessages}
      />
    </AdminInbox>
  )
}
