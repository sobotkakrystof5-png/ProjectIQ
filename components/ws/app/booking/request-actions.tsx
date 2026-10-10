'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { confirmRequest, declineRequest, reopenRequest } from '@/app/w/[business]/poptavky/actions'
import { cn } from '@/lib/ws/utils'
import { undoToast, useWsAction } from './use-ws-action'
import { clockValue, parseClock, StaffSelect, WhenFields } from './when-fields'

export type RequestActionsProps = {
  slug: string
  requestId: string
  /** Chtěný termín v pražském čase; bez něj se potvrzuje s vybraným časem. */
  wanted: { day: string; minutes: number } | null
  /** Byznys má kalendář (potvrzení vytvoří termín). */
  calendar: boolean
  /** Byznys má zakázky (jde přijmout i bez času). */
  jobs: boolean
  staff: { id: string; name: string }[]
  today: string
  /** `compact` = jen hlavní tlačítko (seznamy, Dnes); `full` = panel s Jiný čas a Odmítnout. */
  variant?: 'compact' | 'full'
  className?: string
}

/**
 * Potvrdit / Jiný čas / Odmítnout (S10). Potvrzení je jeden klik na chtěný
 * čas; odmítnutí se provede hned a toast nabídne „Zpět“ (B9).
 */
export function RequestActions(props: RequestActionsProps) {
  const { slug, requestId, wanted, calendar, jobs, staff, today, variant = 'full', className } = props
  const { run, pending } = useWsAction()
  const [other, setOther] = useState(false)
  const [day, setDay] = useState(wanted?.day ?? today)
  const [time, setTime] = useState(wanted ? clockValue(wanted.minutes) : '')
  const [staffId, setStaffId] = useState('')

  // S časem potvrzuje termín; bez času jen přijme (zakázka), nebo musí vybrat čas.
  const oneClick = wanted !== null || !calendar || jobs
  const primaryLabel = wanted && calendar ? 'Potvrdit termín' : calendar && !jobs ? 'Vybrat termín' : 'Přijmout'

  const confirm = (at?: { day: string; minutes: number }) =>
    run(
      () => confirmRequest({ slug, requestId, at: at ?? null, staffId: staffId || null }),
      (r) => toast.success(r.message),
    )

  const decline = () =>
    run(
      () => declineRequest({ slug, requestId }),
      () => undoToast('Poptávka je odmítnutá.', () => reopenRequest({ slug, requestId }), { done: 'Poptávka je zase mezi novými.' }),
    )

  const submitOther = (e: React.FormEvent) => {
    e.preventDefault()
    const minutes = parseClock(time)
    if (!day || minutes === null) {
      toast.error('Vyberte prosím den a čas.')
      return
    }
    void confirm({ day, minutes })
  }

  if (variant === 'compact') {
    if (!oneClick) return null
    return (
      <Button size="md" className={cn('h-10 px-4 text-sm', className)} disabled={pending} onClick={() => void confirm()}>
        <Check aria-hidden size={16} strokeWidth={2} />
        {primaryLabel}
      </Button>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap gap-2">
        {oneClick ? (
          <Button disabled={pending} onClick={() => void confirm()}>
            <Check aria-hidden size={18} strokeWidth={2} />
            {primaryLabel}
          </Button>
        ) : null}
        {calendar && oneClick && (
          <Button variant="outline" disabled={pending} aria-expanded={other} onClick={() => setOther((v) => !v)}>
            Jiný čas
          </Button>
        )}
        <Button variant="ghost" className="text-danger hover:bg-danger/10" disabled={pending} onClick={() => void decline()}>
          Odmítnout
        </Button>
      </div>

      {calendar && (other || !oneClick) && (
        <form onSubmit={submitOther} className="flex flex-col gap-3 rounded-box border bg-ground p-4 dark:bg-navy-950">
          <p className="text-sm text-quiet">
            {wanted ? 'Domluvili jste se se zákazníkem na jiném čase? Zadejte ho a potvrďte.' : 'Kdy zákazníka vezmete?'}
          </p>
          <WhenFields idPrefix={`jiny-${requestId}`} day={day} time={time} onDay={setDay} onTime={setTime} />
          <StaffSelect id={`kdo-${requestId}`} staff={staff} value={staffId} onChange={setStaffId} emptyLabel="Kdo bude mít volno" />
          <div>
            <Button type="submit" disabled={pending}>
              {wanted ? 'Potvrdit jiný čas' : 'Potvrdit termín'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Odmítnutou poptávku vrátí mezi nové (kdyby „Zpět“ v toastu nestihl). */
export function ReopenRequestButton({ slug, requestId }: { slug: string; requestId: string }) {
  const { run, pending } = useWsAction()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => void run(() => reopenRequest({ slug, requestId }), () => toast.message('Poptávka je zase mezi novými.'))}
    >
      Vrátit mezi nové
    </Button>
  )
}
