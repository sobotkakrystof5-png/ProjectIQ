import type { Metadata } from 'next'
import { listAdminThreads } from '@/lib/admin/chat'
import { AdminInbox } from '@/components/admin/chat/inbox'

export const metadata: Metadata = { title: 'Zprávy' }

// Schránka Zprávy (KP15, R-122): konverzace všech klientů, nejnovější nahoře.
export default async function ZpravyPage() {
  const threads = await listAdminThreads()
  return (
    <AdminInbox threads={threads} activeId={null}>
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-quiet">
          {threads.length > 0 ? 'Vyberte vlevo konverzaci.' : 'Až propojíte zakázku s klientským prostorem, konverzace se objeví tady.'}
        </p>
      </div>
    </AdminInbox>
  )
}
