'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useWsUndoAction } from '@/components/ws/app/booking/use-ws-action'
import { savePortalSettings } from '@/app/w/[business]/nastaveni/actions'
import { ADDRESS_MAX, CHANGE_HOURS_OPTIONS, changeHoursLabel, type ChangeHours, type PortalRules } from '@/lib/ws/portal-rules'

/** Pravidla odkazu pro zákazníka (S16): do kdy smí termín přesunout nebo zrušit a adresa provozovny. */
export function PortalRulesForm({ slug, rules, readOnly }: { slug: string; rules: PortalRules; readOnly: boolean }) {
  const { run, pending } = useWsUndoAction()
  const [hours, setHours] = useState<ChangeHours>(rules.changeHours)
  const [address, setAddress] = useState(rules.address ?? '')
  const saved = useRef({ hours: rules.changeHours, address: rules.address ?? '' })
  const options: ChangeHours[] = [...CHANGE_HOURS_OPTIONS, null]
  const save = useCallback((next: { hours: ChangeHours; address: string }) => {
    const previous = saved.current
    return run(
      () => savePortalSettings({ slug, changeHours: next.hours, address: next.address }),
      async () => {
        const result = await savePortalSettings({ slug, changeHours: previous.hours, address: previous.address })
        if (result.ok) {
          saved.current = previous
          setHours(previous.hours)
          setAddress(previous.address)
        }
        return result
      },
      'Nastavení portálu je uložené.',
      'Předchozí nastavení je zpátky.',
    ).then((ok) => { if (ok) saved.current = next })
  }, [run, slug])

  useEffect(() => {
    const next = { hours, address }
    if (hours === saved.current.hours && address === saved.current.address) return
    const timer = window.setTimeout(() => {
      if (hours === saved.current.hours && address === saved.current.address) return
      void save(next)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [hours, address, save])

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
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
      <p aria-live="polite" className="min-h-5 text-sm text-quiet">{pending ? 'Ukládám…' : 'Změny se ukládají automaticky.'}</p>
    </div>
  )
}
