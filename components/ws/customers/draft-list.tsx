'use client'

import { Send, X } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { discardMessageDraft, sendMessageDraft } from '@/app/w/[business]/zakaznici/actions'
import { undoToast, useWsAction } from '@/components/ws/app/booking/use-ws-action'

/** Připravené zprávy (koncepty, které ještě neodešly): odeslat, nebo zahodit. */
export function DraftList({ slug, drafts }: { slug: string; drafts: { id: string; name: string; subject: string }[] }) {
  const { run, pending } = useWsAction()
  const discard = (id: string) =>
    run(
      () => discardMessageDraft({ slug, id, discarded: true }),
      () => undoToast('Zpráva je zahozená.', () => discardMessageDraft({ slug, id, discarded: false }), { done: 'Zpráva je zpátky.' }),
    )
  const send = (id: string) =>
    run(
      () => sendMessageDraft({ slug, id }),
      (r) => toast.success(r.message),
    )
  return (
    <section aria-labelledby="pripravene-zpravy" className="flex flex-col gap-2 border-t pt-4">
      <h3 id="pripravene-zpravy" className="text-sm font-semibold text-ink">
        Připravené zprávy
      </h3>
      <p className="text-sm text-quiet">Zprávy, které jste uložili a ještě neodešly.</p>
      <ul className="flex flex-col gap-1">
        {drafts.map((d) => (
          <li key={d.id} className="flex min-h-11 items-center gap-2">
            <span className="min-w-0 flex-1">
              <span data-ws-private-value className="block truncate text-sm font-medium text-ink">{d.name}</span>
              <span className="block truncate text-xs text-quiet">{d.subject}</span>
            </span>
            <button
              type="button"
              onClick={() => void send(d.id)}
              disabled={pending}
              aria-label={`Odeslat zprávu pro ${d.name}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-navy-700 transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Send aria-hidden size={18} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => void discard(d.id)}
              disabled={pending}
              aria-label={`Zahodit zprávu pro ${d.name}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet transition-colors hover:bg-accent hover:text-ink disabled:opacity-50"
            >
              <X aria-hidden size={18} strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
