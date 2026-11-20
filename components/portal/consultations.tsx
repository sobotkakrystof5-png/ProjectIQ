'use client'

import { useState, useTransition } from 'react'
import { CalendarClock, Loader2, Video } from 'lucide-react'
import { SlotPicker } from '@/components/consultations/slot-picker'
import { bookConsultation, cancelConsultation, moveConsultation } from '@/app/klient/projekt/[id]/actions'
import { canClientChange, consultationWhen, type FreeSlot } from '@/lib/consultations/rules'
import { CHANNEL_LABELS } from '@/lib/types'

/**
 * Konzultace v detailu projektu klientského prostoru (KP14, R-126).
 *
 * Klient vybere den a čas z volna, které Kryštof označil v kalendáři,
 * napíše pár slov, o čem chce mluvit, a potvrdí. Do 24 hodin před začátkem
 * ji sám přesune nebo zruší; zrušení jde hned vrátit (znovu se zarezervuje
 * stejný čas, pokud je pořád volný).
 */

export type ClientConsultation = {
  id: string
  startsAt: string
  endsAt: string
  topic: string
  channel: 'whatsapp' | 'teams' | 'meet' | 'phone' | 'other'
  meetUrl: string | null
  meetPending: boolean
}

type Mode = { kind: 'idle' } | { kind: 'book' } | { kind: 'move'; id: string }

const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)

const primary =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-chip bg-navy-700 px-4 text-sm font-semibold text-white hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const quiet =
  'inline-flex min-h-11 items-center justify-center rounded-chip px-3 text-sm font-medium text-quiet hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const outline =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-chip border border-navy-100 px-4 text-sm font-medium text-ink hover:border-navy-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

export function ProjectConsultations({
  projectId,
  today,
  upcoming,
  freeSlots,
}: {
  projectId: string
  today: string
  upcoming: ClientConsultation[]
  freeSlots: FreeSlot[]
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [day, setDay] = useState<string | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState<{ startsAt: string; topic: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function open(next: Mode) {
    setMode(next)
    setDay(null)
    setStart(null)
    setError(null)
    setNotice(null)
    setCancelled(null)
  }

  function submitBooking() {
    if (!start) return setError('Vyberte prosím den a čas.')
    if (topic.trim().length < 3) return setError('Napište prosím pár slov, o čem se chcete bavit.')
    startTransition(async () => {
      const res = await bookConsultation(projectId, { startsAt: start, topic: topic.trim() })
      if (!res.success) return setError(res.error ?? 'Rezervace se nepovedla. Zkuste to prosím znovu.')
      setMode({ kind: 'idle' })
      setTopic('')
      setNotice('Konzultace je zarezervovaná. Potvrzení s odkazem na Google Meet vám přijde e-mailem.')
    })
  }

  function submitMove(id: string) {
    if (!start) return setError('Vyberte prosím nový den a čas.')
    startTransition(async () => {
      const res = await moveConsultation(id, { startsAt: start })
      if (!res.success) return setError(res.error ?? 'Přesun se nepovedl. Zkuste to prosím znovu.')
      setMode({ kind: 'idle' })
      setNotice('Konzultace je přesunutá. Nové potvrzení vám přijde e-mailem.')
    })
  }

  function cancel(c: ClientConsultation) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await cancelConsultation(c.id)
      if (!res.success) return setError(res.error ?? 'Zrušení se nepovedlo. Zkuste to prosím znovu.')
      setCancelled({ startsAt: c.startsAt, topic: c.topic })
    })
  }

  function undoCancel() {
    if (!cancelled) return
    const again = cancelled
    startTransition(async () => {
      const res = await bookConsultation(projectId, { startsAt: again.startsAt, topic: again.topic || 'Konzultace' })
      setCancelled(null)
      if (!res.success) return setError(res.error ?? 'Konzultaci se nepodařilo vrátit. Vyberte prosím nový čas.')
      setNotice('Konzultace je zpátky. Nový odkaz na Google Meet vám přijde e-mailem.')
    })
  }

  const picking = mode.kind !== 'idle'

  return (
    <section className="mt-5 rounded-box border border-navy-100 bg-surface p-5" aria-labelledby="konzultace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="konzultace" className="flex items-center gap-2 text-base font-semibold text-ink">
          <CalendarClock size={18} strokeWidth={1.5} className="text-navy-600" aria-hidden="true" />
          Konzultace
        </h2>
        {!picking && freeSlots.length > 0 && (
          <button type="button" className={primary} onClick={() => open({ kind: 'book' })}>
            Domluvit konzultaci
          </button>
        )}
      </div>

      {notice && <p role="status" className="mt-3 text-sm text-ink">{notice}</p>}
      {cancelled && (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink">
          Konzultace je zrušená.
          <button type="button" className={quiet} onClick={undoCancel} disabled={pending}>
            Vrátit
          </button>
        </p>
      )}

      {upcoming.length === 0 && !picking && (
        <p className="mt-2 text-sm text-quiet">
          {freeSlots.length > 0
            ? 'Chcete něco probrat? Vyberte si čas, kdy mám volno, a spojíme se přes Google Meet.'
            : 'Volný termín teď nemám. Napište mi prosím zprávu níž a domluvíme se.'}
        </p>
      )}

      {upcoming.length > 0 && (
        <ul className="mt-4 space-y-3">
          {upcoming.map((c) => {
            const changeable = canClientChange(c.startsAt)
            return (
              <li key={c.id} className="rounded-chip border border-navy-100 p-4">
                <p className="font-medium text-ink">
                  {consultationWhen(c.startsAt, today)}
                  <span className="font-normal text-quiet"> · {minutesBetween(c.startsAt, c.endsAt)} minut</span>
                </p>
                {c.topic && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-quiet">{c.topic}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {c.meetUrl ? (
                    <a href={c.meetUrl} target="_blank" rel="noopener noreferrer" className={primary}>
                      <Video size={15} strokeWidth={1.5} aria-hidden="true" />
                      Připojit se
                    </a>
                  ) : (
                    <span className="text-sm text-quiet">
                      {c.channel === 'meet' ? 'Odkaz na Google Meet vám přijde e-mailem.' : `Spojíme se přes: ${CHANNEL_LABELS[c.channel]}`}
                    </span>
                  )}
                  {changeable && !picking && (
                    <>
                      <button type="button" className={outline} onClick={() => open({ kind: 'move', id: c.id })} disabled={pending || freeSlots.length === 0}>
                        Přesunout
                      </button>
                      <button type="button" className={quiet} onClick={() => cancel(c)} disabled={pending}>
                        Zrušit
                      </button>
                    </>
                  )}
                </div>
                {!changeable && (
                  <p className="mt-2 text-xs text-quiet">Do začátku zbývá méně než 24 hodin. Změnu mi prosím napište zprávou.</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {picking && (
        <div className="mt-4 space-y-4 border-t border-navy-100 pt-4">
          <p className="text-sm font-medium text-ink">
            {mode.kind === 'move' ? 'Vyberte nový čas' : 'Kdy se vám to hodí?'}
          </p>
          <SlotPicker
            slots={freeSlots}
            today={today}
            day={day}
            value={start}
            onDayChange={(d) => { setDay(d); setStart(null); setError(null) }}
            onChange={(s) => { setStart(s); setError(null) }}
          />
          {mode.kind === 'book' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="konzultace-tema" className="text-sm font-medium text-ink">O čem se chcete bavit?</label>
              <textarea
                id="konzultace-tema"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Třeba: chci projít návrh úvodní stránky."
                className="w-full resize-none rounded-chip border border-navy-100 bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-quiet focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={pending}
              onClick={() => (mode.kind === 'move' ? submitMove(mode.id) : submitBooking())}
            >
              {pending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
              {mode.kind === 'move' ? 'Přesunout na tento čas' : 'Zarezervovat'}
            </button>
            <button type="button" className={quiet} onClick={() => open({ kind: 'idle' })} disabled={pending}>
              {mode.kind === 'move' ? 'Nechat původní čas' : 'Zavřít'}
            </button>
          </div>
        </div>
      )}

      {!picking && error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </section>
  )
}
