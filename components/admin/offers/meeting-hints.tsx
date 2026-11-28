'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, MessageSquareText } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { meetingHintsAction } from '@/app/offer-meeting-actions'
import type { OfferMeeting } from '@/lib/admin/offers/meeting-hints'
import type { HintField, MeetingHint } from '@/lib/admin/offers/meeting-hints-check'
import type { OfferKind } from '@/lib/admin/offers/pricing'

/**
 * Ze schůzky (navrhovač nabídek N4, R-158): poslední schůzka s klientem ze
 * ZakazIQ Voice nad vstupy nabídky. „Načíst ze schůzky" nechá model projít
 * přepis; každý návrh má citaci a do editoru se dostane až kliknutím
 * na „Použít". Uloží ho až Kryštof spolu s konceptem.
 */

/** Co návrh změní v editoru nabídky (podmnožina jeho stavu). */
export type HintPatch = { typicalJob?: string; kind?: OfferKind; languages?: number; rush?: boolean }

const czk = (n: number) => `${n.toLocaleString('cs-CZ')}\u00a0Kč`
const dateText = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' }).format(new Date(iso))

const quietBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50 disabled:opacity-60'

function label(h: MeetingHint): string {
  switch (h.field) {
    case 'typical_job':
      return `Jedna zakázka klienta: ${czk(h.czk)}`
    case 'kind':
      return `Co stavím: ${h.kind === 'eshop' ? 'e-shop' : 'web'}`
    case 'languages':
      return `Jazyky navíc: ${h.extra}`
    case 'rush':
      return 'Spěch: klient potřebuje web rychleji než obvykle'
    case 'budget':
      return `Rozpočet klienta: ${h.text}`
  }
}

/** Rozpočet je jen pro informaci, ostatní jde do editoru. */
export function patchFor(h: MeetingHint): HintPatch | null {
  switch (h.field) {
    case 'typical_job':
      return { typicalJob: String(h.czk) }
    case 'kind':
      return { kind: h.kind }
    case 'languages':
      return { languages: h.extra }
    case 'rush':
      return { rush: true }
    case 'budget':
      return null
  }
}

export function MeetingHints({
  proposalId,
  meeting,
  onApply,
}: {
  proposalId: string
  meeting: OfferMeeting
  onApply: (patch: HintPatch) => void
}) {
  const [pending, startTransition] = useTransition()
  const [hints, setHints] = useState<MeetingHint[] | null>(null)
  const [used, setUsed] = useState<HintField[]>([])

  const load = () =>
    startTransition(async () => {
      const res = await meetingHintsAction(proposalId)
      if (!res.ok) {
        toast.error('Ze schůzky se nic nenačetlo', { description: res.error })
        return
      }
      setHints(res.hints)
      setUsed([])
    })

  const apply = (h: MeetingHint) => {
    const patch = patchFor(h)
    if (patch === null) return
    onApply(patch)
    setUsed((u) => [...u, h.field])
  }

  return (
    <section aria-labelledby="ze-schuzky" className="flex flex-col gap-3 rounded-chip border border-navy-100 p-4">
      <div className="flex flex-col gap-0.5">
        <h3 id="ze-schuzky" className="text-sm font-semibold text-ink">
          Ze schůzky
        </h3>
        <p className="text-xs text-quiet">
          {meeting.title ?? 'Schůzka s klientem'}
          {' · '}
          <span className="font-num">{dateText(meeting.startedAt)}</span>
        </p>
      </div>

      {meeting.summary && <p className="text-sm text-ink">{meeting.summary}</p>}
      {meeting.agreements.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-quiet">Na čem jste se domluvili</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink">
            {meeting.agreements.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {hints === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={load} disabled={pending} className={quietBtn}>
            {pending ? (
              <Loader2 size={15} strokeWidth={1.75} className="animate-spin" aria-hidden />
            ) : (
              <MessageSquareText size={15} strokeWidth={1.75} aria-hidden />
            )}
            {pending ? 'Prochází se přepis…' : 'Načíst ze schůzky'}
          </button>
          <span className="text-xs text-quiet">Navrhne vstupy z přepisu. Nic se nezmění, dokud nekliknete na Použít.</span>
        </div>
      ) : hints.length === 0 ? (
        <p className="text-sm text-quiet">Ve schůzce nezaznělo nic, co by šlo do nabídky. Vstupy vyplňte ručně.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-navy-100 rounded-chip border border-navy-100" aria-live="polite">
          {hints.map((h) => {
            const done = used.includes(h.field)
            const applicable = patchFor(h) !== null
            return (
              <li key={h.field} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{label(h)}</p>
                  <p className="text-xs text-quiet">„{h.quote}"</p>
                </div>
                {applicable ? (
                  <button type="button" onClick={() => apply(h)} disabled={done} className={quietBtn}>
                    {done && <Check size={15} strokeWidth={1.75} aria-hidden />}
                    {done ? 'Použito' : 'Použít'}
                  </button>
                ) : (
                  <span className="text-xs text-quiet">jen pro vás</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
