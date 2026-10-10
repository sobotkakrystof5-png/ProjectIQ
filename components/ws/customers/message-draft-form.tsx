'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { saveMessageDraft } from '@/app/w/[business]/zakaznici/actions'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import type { MessageTopic } from '@/lib/ws/detail-param'

/**
 * „Připravit zprávu“ z panelu Komu napsat: předvyplněný e-mail, který jde
 * upravit. Uloží se jako koncept; odeslání přes frontu doplní S15.
 */
export function MessageDraftForm({
  slug,
  customerId,
  topic,
  email,
  initial,
  closeHref,
}: {
  slug: string
  customerId: string
  topic: MessageTopic
  email: string
  initial: { subject: string; body: string }
  closeHref: string
}) {
  const router = useRouter()
  const { run, pending } = useWsAction()
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(
      () => saveMessageDraft({ slug, customerId, kind: topic, subject, body }),
      (r) => {
        toast.success(r.message)
        router.push(closeHref, { scroll: false })
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-quiet">
        E-mailem na <span className="text-ink">{email}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zprava-predmet">Předmět</Label>
        <Input id="zprava-predmet" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="zprava-text">Text</Label>
        <textarea
          id="zprava-text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={10}
          required
          className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink transition-colors focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>
      <p className="rounded-chip bg-navy-50 px-3 py-2.5 text-sm text-navy-900 dark:bg-navy-800 dark:text-navy-50">
        Zprávu uložíme jako připravenou. Odešleme ji, až v aplikaci zapneme e-maily.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          Uložit zprávu
        </Button>
      </div>
    </form>
  )
}
