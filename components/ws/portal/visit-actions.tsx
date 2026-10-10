'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cancelVisit, getMoveSlots, moveVisit, type PortalSlots } from '@/app/z/[token]/actions'
import { cn } from '@/lib/ws/utils'

/**
 * Přesunout / Zrušit v klientském portálu (S16). Přesun = volné časy podle
 * otevírací doby, kolizi rozhodne DB. Zrušení má potvrzení přímo na místě:
 * zákazník ho nemůže vrátit „Zpět“ (čas se hned uvolní a firma dostane e-mail).
 */
export function VisitActions({
  token,
  canMove,
  canCancel,
  deadline,
  locked,
}: {
  token: string
  canMove: boolean
  canCancel: boolean
  deadline: string | null
  locked: 'off' | 'late' | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<'idle' | 'move' | 'cancel'>('idle')
  const [slots, setSlots] = useState<PortalSlots | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  if (locked) {
    return (
      <p className="text-[15px] text-quiet">
        {locked === 'late'
          ? 'Na změnu přes tenhle odkaz už je pozdě. Když potřebujete termín změnit, napište prosím firmě.'
          : 'Když potřebujete termín změnit, napište prosím firmě.'}
      </p>
    )
  }
  if (!canMove && !canCancel) return null

  const openMove = () => {
    setMode('move')
    setMessage(null)
    if (slots) return
    start(async () => {
      const res = await getMoveSlots({ token })
      if (!res.ok) {
        setMessage({ text: res.error, error: true })
        setMode('idle')
        return
      }
      setSlots(res.slots)
      setDay(res.slots[0]?.date ?? null)
    })
  }

  const pick = (date: string, minutes: number, label: string) => {
    setMessage(null)
    start(async () => {
      const res = await moveVisit({ token, day: date, minutes })
      if (!res.ok) {
        setMessage({ text: res.error, error: true })
        if (res.slotTaken) {
          const fresh = await getMoveSlots({ token })
          if (fresh.ok) setSlots(fresh.slots)
        }
        return
      }
      setMode('idle')
      setSlots(null)
      setMessage({ text: `Přesunuto na ${label}. Potvrzení vám přijde e-mailem.`, error: false })
      router.refresh()
    })
  }

  const cancel = () => {
    setMessage(null)
    start(async () => {
      const res = await cancelVisit({ token })
      if (!res.ok) {
        setMessage({ text: res.error, error: true })
        return
      }
      setMode('idle')
      router.refresh()
    })
  }

  const active = slots?.find((d) => d.date === day) ?? slots?.[0] ?? null

  return (
    <div className="flex flex-col gap-4 border-t border-navy-100 pt-5">
      {deadline && <p className="text-[14px] text-quiet">Přesunout nebo zrušit jde do {deadline}.</p>}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {canMove && (
            <Button variant="outline" onClick={openMove} disabled={pending}>
              Přesunout
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" className="text-danger" onClick={() => setMode('cancel')} disabled={pending}>
              Zrušit termín
            </Button>
          )}
        </div>
      )}

      {mode === 'move' && (
        <div className="flex flex-col gap-3">
          <p className="text-[17px] font-semibold text-ink">Vyberte nový čas</p>
          {!slots ? (
            <p className="text-[15px] text-quiet" aria-live="polite">
              Hledáme volné časy…
            </p>
          ) : slots.length === 0 ? (
            <p className="text-[15px] text-quiet">V příštích třech týdnech je všechno obsazené. Napište prosím firmě.</p>
          ) : (
            <>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Den">
                {slots.map((d) => (
                  <Pill key={d.date} active={d.date === active?.date} onClick={() => setDay(d.date)}>
                    {d.label}
                  </Pill>
                ))}
              </div>
              {active && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Čas">
                  {active.times.map((t) => (
                    <Pill key={t.minutes} active={false} disabled={pending} onClick={() => pick(active.date, t.minutes, `${active.label} v ${t.time}`)}>
                      <span className="font-num">{t.time}</span>
                    </Pill>
                  ))}
                </div>
              )}
            </>
          )}
          <Button variant="ghost" className="self-start" onClick={() => setMode('idle')} disabled={pending}>
            Nechat původní čas
          </Button>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="flex flex-col gap-3 rounded-chip bg-navy-50 p-4">
          <p className="text-[15px] text-ink">Termín se zruší a čas se uvolní pro ostatní. Vrátit to tady nepůjde.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={cancel} disabled={pending}>
              Zrušit termín
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={pending}>
              Nechat termín
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className={cn('text-[15px]', message.error ? 'text-danger' : 'text-ink')} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function Pill({ active, children, ...props }: { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 text-[15px] font-semibold transition-colors disabled:opacity-50',
        active ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-900 hover:bg-navy-100',
      )}
      {...props}
    >
      {children}
    </button>
  )
}
