import type { Metadata } from 'next'
import { requireClient } from '@/lib/portal/context'
import { listClientThreads } from '@/lib/portal/chat'
import { ClientPageHeader, ClientShell } from '@/components/portal/client-shell'
import { ThreadList } from '@/components/chat/thread-list'

export const metadata: Metadata = { title: 'Zprávy' }

// Zprávy (KP15): na telefonu seznam zakázek s poslední zprávou jako ve
// WhatsAppu, na počítači je seznam vlevo a tady jen výzva k výběru.
export default async function KlientZpravyPage() {
  const ctx = await requireClient()
  const threads = await listClientThreads(ctx.clientId)
  return (
    <ClientShell ctx={ctx} section="zpravy">
      <ClientPageHeader title="Zprávy" clientName={ctx.clientName} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface md:hidden">
        <ThreadList threads={threads} activeId={null} hrefBase="/klient/zpravy" viewer="client" empty="Zatím tu žádná zakázka není." />
      </div>
      <div className="hidden flex-1 items-center justify-center p-8 text-center md:flex">
        <p className="max-w-sm text-sm text-quiet">
          {threads.length > 0 ? 'Vyberte vlevo zakázku a napište, co potřebujete.' : 'Jakmile na vašem projektu začneme pracovat, objeví se tady.'}
        </p>
      </div>
    </ClientShell>
  )
}
