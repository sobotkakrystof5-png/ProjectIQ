'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { saveLoyaltySettings } from '@/app/w/[business]/nastaveni/vernost/actions'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { LoyaltyCard } from '@/components/ws/brand'
import { parseAmount } from '@/components/ws/customers/visit-payment'
import type { LoyaltyCounts, LoyaltyProgram } from '@/lib/ws/loyalty'
import { cn } from '@/lib/ws/utils'

const COUNTS: { key: LoyaltyCounts; label: string; help: string }[] = [
  { key: 'visit_paid', label: 'Zaplacená návštěva', help: 'Razítko se přidá po zaplacení návštěvy.' },
  { key: 'job_done', label: 'Dokončená zakázka', help: 'Razítko se přidá po dokončení zakázky.' },
  { key: 'amount', label: 'Útrata', help: 'Razítka se přidávají podle zaplacené částky.' },
]

const num = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))

/** Nastavení › Věrnost (S12): pravidla razítek s náhledem karty. */
export function LoyaltySettings({
  slug,
  businessName,
  businessColor,
  program,
  services,
  readOnly,
}: {
  slug: string
  businessName: string
  businessColor: string | null
  program: LoyaltyProgram
  services: { id: string; name: string }[]
  readOnly: boolean
}) {
  const { run, pending } = useWsAction()
  const [enabled, setEnabled] = useState(program.enabled)
  const [needed, setNeeded] = useState(String(program.stampsNeeded))
  const [reward, setReward] = useState(program.rewardText)
  const [counts, setCounts] = useState<LoyaltyCounts>(program.counts)
  const [perStamp, setPerStamp] = useState(num(program.amountPerStamp))
  const [onlyServices, setOnlyServices] = useState<string[]>(program.serviceIds)
  const [minSpend, setMinSpend] = useState(num(program.minSpend))
  const [onePerDay, setOnePerDay] = useState(program.maxOnePerDay)
  const [validity, setValidity] = useState(program.validityMonths === null ? '' : String(program.validityMonths))
  const [auto, setAuto] = useState(program.autoStamp)

  const neededNum = Math.min(50, Math.max(1, Number.parseInt(needed, 10) || 1))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const per = perStamp.trim() ? parseAmount(perStamp) : null
    const min = minSpend.trim() ? parseAmount(minSpend) : null
    const months = validity.trim() ? Number.parseInt(validity, 10) : null
    if ((perStamp.trim() && per === null) || (minSpend.trim() && min === null)) {
      toast.error('Částka nevypadá správně. Napište ji prosím jako 500 nebo 500,50.')
      return
    }
    if (validity.trim() && (!months || months < 1 || months > 120)) {
      toast.error('Platnost napište v měsících, 1 až 120. Bez omezení nechte prázdné.')
      return
    }
    void run(
      () =>
        saveLoyaltySettings({
          slug,
          enabled,
          stampsNeeded: neededNum,
          rewardText: reward,
          counts,
          amountPerStamp: per,
          serviceIds: counts === 'job_done' ? [] : onlyServices,
          minSpend: min,
          maxOnePerDay: onePerDay,
          validityMonths: months,
          autoStamp: auto,
        }),
      () => toast.success(enabled ? 'Uloženo. Věrnostní karty jsou zapnuté.' : 'Uloženo.'),
    )
  }

  const toggleService = (id: string, on: boolean) =>
    setOnlyServices((prev) => (on ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)))

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <fieldset disabled={readOnly || pending} className="flex min-w-0 flex-col gap-6">
        <div className="flex items-start justify-between gap-4 rounded-panel border bg-surface p-5">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="vernost-zapnuto" className="text-[16px]">
              Věrnostní karty
            </Label>
            <p className="text-sm text-quiet">Zákazník sbírá razítka a za plnou kartu dostane odměnu.</p>
          </div>
          <Switch id="vernost-zapnuto" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className={cn('flex flex-col gap-6 rounded-panel border bg-surface p-5', !enabled && 'opacity-60')}>
          <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vernost-pocet">Kolik razítek do odměny?</Label>
              <Input id="vernost-pocet" inputMode="numeric" value={needed} onChange={(e) => setNeeded(e.target.value)} maxLength={2} className="font-num" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vernost-odmena">Jaká je odměna?</Label>
              <Input id="vernost-odmena" value={reward} onChange={(e) => setReward(e.target.value)} maxLength={120} placeholder="Například střih zdarma" />
            </div>
          </div>

          <p className="text-sm text-quiet">{COUNTS.find((c) => c.key === counts)?.help}</p>

          <details className="rounded-box border px-4 py-2">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink">Pokročilé</summary>
            <div className="flex flex-col gap-6 pb-3 pt-2">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">Za co je razítko</legend>
                <div className="flex flex-wrap gap-2">
                  {COUNTS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={counts === c.key}
                      onClick={() => setCounts(c.key)}
                      className={cn(
                        'inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold transition-colors',
                        counts === c.key ? 'bg-navy-700 text-white' : 'bg-navy-50 text-navy-900 hover:bg-navy-100 dark:bg-navy-900 dark:text-navy-100',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-quiet">{COUNTS.find((c) => c.key === counts)?.help}</p>
              </fieldset>

              {counts === 'amount' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vernost-castka">Jedno razítko za každých (Kč)</Label>
                  <Input id="vernost-castka" inputMode="decimal" value={perStamp} onChange={(e) => setPerStamp(e.target.value)} maxLength={10} className="font-num sm:max-w-[200px]" />
                </div>
              )}

              {counts !== 'job_done' && services.length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium text-ink">Jen za tyhle služby</legend>
                  <p className="-mt-1 text-sm text-quiet">Když nevyberete nic, počítá se každá služba.</p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {services.map((s) => (
                      <li key={s.id} className="flex min-h-11 items-center gap-3">
                        <Checkbox id={`sluzba-${s.id}`} checked={onlyServices.includes(s.id)} onCheckedChange={(v) => toggleService(s.id, v === true)} />
                        <Label htmlFor={`sluzba-${s.id}`} className="font-normal">
                          {s.name}
                        </Label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vernost-minimum">Minimální útrata (Kč, nepovinné)</Label>
                  <Input id="vernost-minimum" inputMode="decimal" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} maxLength={10} className="font-num" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vernost-platnost">Platnost karty v měsících (nepovinné)</Label>
                  <Input
                    id="vernost-platnost"
                    inputMode="numeric"
                    value={validity}
                    onChange={(e) => setValidity(e.target.value)}
                    maxLength={3}
                    placeholder="Bez omezení"
                    className="font-num"
                  />
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="vernost-den">Nejvýš 1 razítko za den</Label>
                  <p className="text-sm text-quiet">Dvě návštěvy v jeden den dají jedno razítko.</p>
                </div>
                <Switch id="vernost-den" checked={onePerDay} onCheckedChange={setOnePerDay} />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="vernost-auto">Razítko automaticky</Label>
                  <p className="text-sm text-quiet">
                    {auto ? 'Razítko přibude samo po zaplacení.' : 'Razítko dáte ručně tlačítkem u zaplaceného termínu.'}
                  </p>
                </div>
                <Switch id="vernost-auto" checked={auto} onCheckedChange={setAuto} />
              </div>
            </div>
          </details>
        </div>

        <p className="text-sm text-quiet">Po uplatnění odměny začne nová karta. Ruční razítko můžete hned vrátit tlačítkem Zpět.</p>

        {!readOnly && (
          <div>
            <Button type="submit" disabled={pending}>
              Uložit
            </Button>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start">
        <p className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Náhled</p>
        <LoyaltyCard
          customer="Váš zákazník"
          business={businessName}
          stamps={0}
          total={neededNum}
          reward={reward || 'odměna'}
          accentColor={businessColor}
        />
      </div>
    </form>
  )
}
