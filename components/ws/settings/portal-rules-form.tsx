'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { savePortalSettings } from '@/app/w/[business]/nastaveni/actions'
import { ADDRESS_MAX, CHANGE_HOURS_OPTIONS, changeHoursLabel, type ChangeHours, type PortalRules } from '@/lib/ws/portal-rules'

/** Pravidla odkazu pro zákazníka (S16): do kdy smí termín přesunout nebo zrušit a adresa provozovny. */
export function PortalRulesForm({ slug, rules, readOnly }: { slug: string; rules: PortalRules; readOnly: boolean }) {
  const { run, pending } = useWsAction()
  const [hours, setHours] = useState<ChangeHours>(rules.changeHours)
  const [address, setAddress] = useState(rules.address ?? '')
  const options: ChangeHours[] = [...CHANGE_HOURS_OPTIONS, null]

  return (
    <form
      className="flex flex-col gap-4 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => savePortalSettings({ slug, changeHours: hours, address }), () => toast.success('Uloženo'))
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Přesunout nebo zrušit termín může zákazník
        <select
          className="h-11 rounded-chip border border-input bg-surface px-3 text-[15px] font-normal text-ink"
          value={hours === null ? 'off' : String(hours)}
          disabled={readOnly || pending}
          onChange={(e) => setHours(e.target.value === 'off' ? null : (Number(e.target.value) as ChangeHours))}
        >
          {options.map((h) => (
            <option key={h === null ? 'off' : h} value={h === null ? 'off' : h}>
              {changeHoursLabel(h)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Adresa, kam zákazník přijde (nepovinné)
        <Input value={address} maxLength={ADDRESS_MAX} placeholder="Ulice 12, Město" disabled={readOnly || pending} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <Button type="submit" variant="outline" className="self-start" disabled={readOnly || pending}>
        Uložit
      </Button>
    </form>
  )
}
