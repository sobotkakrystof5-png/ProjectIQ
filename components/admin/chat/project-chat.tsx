import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { loadAdminThread } from '@/lib/admin/chat'
import { ChatThread } from '@/components/chat/chat-thread'
import { isTranscriptionConfigured } from '@/lib/transcribe'
import { makeRequestFromMessages } from '@/app/dashboard/zpravy/actions'

/**
 * Totéž vlákno jako ve schránce Zprávy, v detailu zakázky (KP15). Zakázka
 * nepropojená s klientským prostorem chat nemá.
 */
export async function AdminProjectChat({ projectId }: { projectId: string }) {
  const thread = await loadAdminThread(projectId).catch(() => null)
  if (!thread) return null
  return (
    <div className="space-y-2">
      <div className="flex h-[560px] flex-col overflow-hidden rounded-chip border border-navy-100 bg-ground">
        <ChatThread
          viewer="admin"
          projectId={projectId}
          messages={thread.messages}
          reads={thread.reads}
          sendUrl="/api/zpravy"
          attachmentBase="/api/zpravy/prilohy"
          transcribeUrl={isTranscriptionConfigured() ? '/api/ai-assistant/prepis' : null}
          otherName={thread.info.clientName}
          onMakeRequest={makeRequestFromMessages}
        />
      </div>
      <Link href={`/dashboard/zpravy/${projectId}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-navy-700 hover:underline">
        <MessagesSquare size={15} strokeWidth={1.5} aria-hidden="true" /> Otevřít ve Zprávách
      </Link>
    </div>
  )
}
