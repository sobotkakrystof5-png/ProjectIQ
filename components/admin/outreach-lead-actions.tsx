'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { dismissOutreachLead, takeOverOutreachLead, undoDismissOutreachLead } from '@/app/outreach-actions'
import { ScheduleMeetingDialog, type MeetingReadiness } from '@/components/admin/schedule-meeting-dialog'
import { SendEmailButton } from '@/components/admin/send-email-button'
import { formatWhen, type OutreachQueueRow } from '@/lib/admin/outreach-view'

/**
 * Co se dá s firmou od AI asistenta udělat (R-112): domluvit schůzku
 * (Google Meet + e-mail, R-114), převzít do Hovorů, nebo odložit „Nemá zájem"
 * se Zpět. Stejná tlačítka ve frontě i v detailu klienta (R-120).
 */
export function OutreachLeadActions({
  row,
  nowIso,
  meeting,
  className,
  showEmail = true,
}: {
  row: OutreachQueueRow
  nowIso: string
  meeting: MeetingReadiness
  className?: string
  /** Detail klienta má Poslat e-mail v kartě Kontakt, tam se tady neopakuje. */
  showEmail?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [meetingOpen, setMeetingOpen] = useState(false)
  const now = new Date(nowIso)

  const prevzit = () =>
    start(async () => {
      const result = await takeOverOutreachLead(row.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(row.callbackAt ? 'Převzato. Hovor je v kalendáři.' : 'Převzato do Hovorů.')
      router.push(`/dashboard/calls?lead=${result.leadId}`)
    })

  const nezajem = () =>
    start(async () => {
      await dismissOutreachLead(row.id)
      toast.success(`${row.company} je mimo frontu.`, {
        description: 'Asistent mu už volat nebude. Kdyby odpověděl na e-mail, vrátí se sám.',
        undo: () =>
          start(async () => {
            await undoDismissOutreachLead(row.id)
            router.refresh()
          }),
      })
      router.refresh()
    })

  return (
    <>
      <div className={className ?? 'flex flex-wrap items-center gap-2'}>
        <Button type="button" onClick={() => setMeetingOpen(true)} disabled={pending}>
          {/* Termín, který si klient s robotem domluvil, je v okně předvyplněný — stačí potvrdit. */}
          {row.callbackAt && Date.parse(row.callbackAt) > now.getTime()
            ? `Poslat pozvánku na ${formatWhen(row.callbackAt, now)}`
            : 'Domluvit schůzku'}
        </Button>
        {showEmail && (
          <SendEmailButton
            readiness={meeting}
            target={{ kind: 'outreach', id: row.id, company: row.company, email: row.email }}
          />
        )}
        <Button type="button" variant="outline" onClick={prevzit} disabled={pending}>
          Převzít do Hovorů
        </Button>
        <Button type="button" variant="ghost" onClick={nezajem} disabled={pending}>
          Nemá zájem
        </Button>
      </div>
      {meetingOpen && (
        <ScheduleMeetingDialog
          row={row}
          nowIso={nowIso}
          readiness={meeting}
          open={meetingOpen}
          onOpenChange={setMeetingOpen}
        />
      )}
    </>
  )
}
