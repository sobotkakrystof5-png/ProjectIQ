'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Video } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { scheduleMeeting, undoMeeting } from '@/app/meeting-actions'
import { defaultIntro, defaultSubject } from '@/lib/admin/meeting-email'
import { MEETING_LENGTHS, approxIso, initialSlot } from '@/lib/admin/meeting-slot'
import type { OutreachQueueRow } from '@/lib/admin/outreach-view'

/**
 * „Domluvit schůzku" (R-112): termín → Google Meet → událost v kalendáři →
 * e-mail klientovi z krystof@vizeon.cz s odkazem na připojení, ukázkou
 * a webem. E-mail odejde za 15 s; do té doby jde všechno vzít zpět.
 */

export type MeetingReadiness = { google: boolean; mail: boolean }

const fieldClass =
  'w-full rounded-box border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

export function ScheduleMeetingDialog({
  row,
  nowIso,
  readiness,
  open,
  onOpenChange,
}: {
  row: OutreachQueueRow
  nowIso: string
  readiness: MeetingReadiness
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const first = initialSlot(row.callbackAt, nowIso)
  const [date, setDate] = useState(first.date)
  const [time, setTime] = useState(first.time)
  const [minutes, setMinutes] = useState(30)
  const [sendInvite, setSendInvite] = useState(Boolean(row.email) && readiness.mail)
  const [inviteTo, setInviteTo] = useState(row.email ?? '')
  const [subjectEdited, setSubjectEdited] = useState<string | null>(null)
  const [intro, setIntro] = useState(defaultIntro(Boolean(row.demoUrl), row.lastCallAt))
  const [reminders, setReminders] = useState(true)

  const iso = approxIso(date, time)
  const autoSubject = useMemo(() => (iso ? defaultSubject(iso) : 'Naše schůzka'), [iso])
  const subject = subjectEdited ?? autoSubject

  if (!readiness.google) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nejdřív propojte Google</DialogTitle>
            <DialogDescription>
              Odkaz na Google Meet vzniká ve vašem Google Kalendáři. Propojení je jednorázové.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <a
              href="/dashboard/profil#google"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Propojit v Profilu
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const submit = () =>
    start(async () => {
      const result = await scheduleMeeting({
        outreachId: row.id,
        date,
        time,
        minutes,
        sendInvite,
        inviteTo: sendInvite ? inviteTo.trim() : null,
        subject,
        intro,
        reminders: sendInvite && reminders,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
      const eventId = result.eventId
      toast.success(
        result.inviteQueued ? 'Schůzka je v kalendáři. E-mail odejde za 15 s.' : 'Schůzka je v kalendáři.',
        {
          description: 'Odkaz na Meet najdete v kalendáři adminu i v Google Kalendáři.',
          duration: 15_000,
          undo: () =>
            start(async () => {
              const undone = await undoMeeting(eventId)
              if (undone.ok) toast.success('Schůzka zrušená, e-mail neodešel.')
              else toast.error(undone.error)
              router.refresh()
            }),
        },
      )
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Domluvit schůzku: {row.company}</DialogTitle>
          <DialogDescription>
            Vytvoříme odkaz na Google Meet, dáme schůzku do kalendáře a klientovi pošleme e-mail.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Den</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Čas</span>
            <Input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Délka</span>
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="h-11 w-full rounded-chip border border-input bg-surface px-3.5 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {MEETING_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} minut
                </option>
              ))}
            </select>
          </label>
        </div>
        {row.callbackText && (
          <p className="text-xs text-quiet">Klient v hovoru řekl: „{row.callbackText}"</p>
        )}

        <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={sendInvite}
            disabled={!readiness.mail}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="size-5 accent-navy-700"
          />
          Poslat klientovi e-mail z krystof@vizeon.cz
        </label>
        {!readiness.mail && (
          <p className="-mt-2 text-xs text-quiet">
            Odesílání z vizeon.cz ještě není nastavené. Schůzka vznikne, e-mail pošlete sami.
          </p>
        )}

        {sendInvite && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Komu</span>
              <Input type="email" value={inviteTo} onChange={(e) => setInviteTo(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Předmět</span>
              <Input value={subject} maxLength={200} onChange={(e) => setSubjectEdited(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Text</span>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={6}
                maxLength={4000}
                className={fieldClass}
              />
            </label>
            <p className="flex items-start gap-2 text-xs text-quiet">
              <Video size={14} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
              Pod text sami doplníme termín, tlačítko Připojit se ke schůzce
              {row.demoUrl ? ', odkaz na ukázku' : ''}, vizeon.cz a váš podpis. Přiložíme i soubor do kalendáře.
            </p>
            <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-navy-700"
              />
              <span>
                Připomenout klientovi
                <span className="block text-xs text-quiet">
                  Den předem a hodinu předem e-mailem{row.phone ? ', den předem a 10 minut předem SMS' : ''}.
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Zrušit
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !iso || (sendInvite && !inviteTo.trim())}>
            {pending ? 'Vytvářím schůzku…' : sendInvite ? 'Naplánovat a poslat' : 'Naplánovat schůzku'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
