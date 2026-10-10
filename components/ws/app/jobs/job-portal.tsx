'use client'

import { useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { postJobUpdate, saveJobResult, toggleJobUpdate } from '@/app/w/[business]/zakazky/actions'
import { undoToast, useWsAction } from '../booking/use-ws-action'

// Klientský portál v detailu zakázky a termínu (S16): odkaz pro zákazníka,
// zprávy, které uvidí, a odkaz na výsledek.

export function CopyPortalLink({ url, label = 'Zkopírovat odkaz pro zákazníka' }: { url: string; label?: string }) {
  return (
    <Button
      variant="outline"
      className="self-start"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          toast.success('Odkaz zkopírovaný', { description: 'Pošlete ho zákazníkovi. Uvidí v něm jen svůj termín nebo zakázku.' })
        } catch {
          toast.error('Odkaz se nepodařilo zkopírovat', { description: url })
        }
      }}
    >
      <Link2 aria-hidden size={18} strokeWidth={1.5} />
      {label}
    </Button>
  )
}

export function JobUpdates({
  slug,
  jobId,
  canEmail,
  updates,
}: {
  slug: string
  jobId: string
  /** Zákazník má e-mail — nabídnout poslání zprávy e-mailem. */
  canEmail: boolean
  updates: { id: string; body: string; when: string }[]
}) {
  const { run, pending } = useWsAction()
  const [body, setBody] = useState('')
  const [email, setEmail] = useState(true)

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run(
            () => postJobUpdate({ slug, jobId, body, email: canEmail && email }),
            (r) => {
              setBody('')
              toast.success(r.emailed ? 'Odesláno, zákazník dostal e-mail.' : 'Uloženo, zákazník to uvidí v odkazu.')
            },
          )
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Napsat zákazníkovi
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Materiál dorazil, ve čtvrtek začínáme."
            className="min-h-[88px] rounded-chip border border-input bg-surface px-3 py-2 text-[15px] font-normal text-ink outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
          />
        </label>
        {canEmail && (
          <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
            <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} />
            Poslat i e-mailem
          </label>
        )}
        <Button type="submit" className="self-start" disabled={pending || !body.trim()}>
          Odeslat zprávu
        </Button>
      </form>

      {updates.length > 0 && (
        <ul className="flex flex-col gap-2">
          {updates.map((u) => (
            <li key={u.id} className="flex items-start justify-between gap-2 rounded-chip border bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="font-num text-[12px] text-quiet">{u.when}</p>
                <p className="whitespace-pre-line text-[15px] text-ink">{u.body}</p>
              </div>
              <button
                type="button"
                aria-label="Smazat zprávu"
                disabled={pending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-navy-50 hover:text-danger"
                onClick={() =>
                  void run(
                    () => toggleJobUpdate({ slug, updateId: u.id, deleted: true }),
                    () => undoToast('Zpráva smazaná.', () => toggleJobUpdate({ slug, updateId: u.id, deleted: false }), { done: 'Zpráva je zpátky.' }),
                  )
                }
              >
                <Trash2 aria-hidden size={18} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function JobResultForm({ slug, jobId, url }: { slug: string; jobId: string; url: string | null }) {
  const { run, pending } = useWsAction()
  const [value, setValue] = useState(url ?? '')
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => saveJobResult({ slug, jobId, url: value }), () => toast.success('Uloženo'))
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Odkaz na výsledek (fotky, dokument)
        <Input type="url" inputMode="url" value={value} maxLength={500} placeholder="https://" onChange={(e) => setValue(e.target.value)} />
      </label>
      <Button type="submit" variant="outline" className="self-start" disabled={pending || value.trim() === (url ?? '')}>
        Uložit odkaz
      </Button>
    </form>
  )
}
