'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { confirmFromLink } from '@/app/z/odkaz/[token]/actions'

/**
 * Potvrzení poptávky z e-mailu: jedno hlavní tlačítko (chtěný čas), nebo
 * „Jiný čas“ s výběrem dne a času. Výsledek se ukáže na místě.
 */
export function ActionLinkForm({
  token,
  wantedLabel,
  startWithOtherTime,
  defaultDay,
}: {
  token: string
  /** „pátek 13. listopadu v 9:00“, nebo null (zákazník čas nezadal). */
  wantedLabel: string | null
  startWithOtherTime: boolean
  defaultDay: string
}) {
  const [other, setOther] = useState(startWithOtherTime)
  const [day, setDay] = useState(defaultDay)
  const [time, setTime] = useState('09:00')
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = (useOther: boolean) =>
    start(async () => {
      const [h, m] = time.split(':').map(Number)
      const res = await confirmFromLink({ token, at: useOther ? { day, minutes: h * 60 + m } : null })
      setResult(res.ok ? { ok: true, text: res.data.message } : { ok: false, text: res.error })
    })

  if (result?.ok) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-chip bg-navy-50 px-4 py-3 text-[15px] text-navy-900">
        <Check aria-hidden size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-navy-700" />
        {result.text}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {!other && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" disabled={pending} onClick={() => submit(false)}>
            {wantedLabel ? 'Potvrdit termín' : 'Přijmout poptávku'}
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => setOther(true)}>
            Jiný čas
          </Button>
        </div>
      )}
      {other && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit(true)
          }}
        >
          <p className="text-[15px] text-quiet">Čas, na kterém jste se se zákazníkem domluvili. Zákazník dostane e-mail.</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="odkaz-den">Den</Label>
              <Input id="odkaz-den" type="date" value={day} onChange={(e) => setDay(e.target.value)} required className="w-[180px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="odkaz-cas">Čas</Label>
              <Input id="odkaz-cas" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} required className="w-[130px]" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" disabled={pending}>
              Potvrdit
            </Button>
            {!startWithOtherTime && (
              <Button type="button" size="lg" variant="ghost" disabled={pending} onClick={() => setOther(false)}>
                Zpět
              </Button>
            )}
          </div>
        </form>
      )}
      {result && !result.ok && (
        <p role="alert" className="text-[15px] text-danger">
          {result.text}
        </p>
      )}
    </div>
  )
}
