'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { saveSegmentSettings } from '@/app/w/[business]/nastaveni/skupiny/actions'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { SegmentBadge } from '@/components/ws/customers/segment-badge'
import type { SegmentRules } from '@/lib/ws/segments'

/** Nastavení › Skupiny zákazníků (S12): hranice Nových, Stálých a Spících. */
export function SegmentSettings({ slug, rules, readOnly }: { slug: string; rules: SegmentRules; readOnly: boolean }) {
  const { run, pending } = useWsAction()
  const [newDays, setNewDays] = useState(String(rules.newDays))
  const [minVisits, setMinVisits] = useState(String(rules.regularMinVisits))
  const [windowDays, setWindowDays] = useState(String(rules.regularWindowDays))
  const [factor, setFactor] = useState(String(rules.dormantFactor).replace('.', ','))
  const [minDays, setMinDays] = useState(String(rules.dormantMinDays))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const int = (v: string) => Number.parseInt(v, 10)
    const f = Number(factor.replace(',', '.'))
    void run(
      () =>
        saveSegmentSettings({
          slug,
          newDays: int(newDays),
          regularMinVisits: int(minVisits),
          regularWindowDays: int(windowDays),
          dormantFactor: Math.round(f * 4) / 4,
          dormantMinDays: int(minDays),
        }),
      (r) => toast.success(r.changed > 0 ? `Uloženo. Změněné skupiny: ${r.changed}.` : 'Uloženo.'),
    )
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, opts: { decimal?: boolean } = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={opts.decimal ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={5}
        className="font-num sm:max-w-[160px]"
      />
    </div>
  )

  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly || pending} className="flex flex-col gap-4">
        <Group segment="new" text="Zákazníci, kteří k vám poprvé přišli nedávno.">
          {field('skupiny-novi', 'Nový ještě (dní od první návštěvy)', newDays, setNewDays)}
        </Group>
        <Group segment="regular" text="Chodí pravidelně: aspoň tolik návštěv za zvolené období.">
          <div className="flex flex-wrap gap-4">
            {field('skupiny-navstevy', 'Návštěv aspoň', minVisits, setMinVisits)}
            {field('skupiny-okno', 'Za (dní)', windowDays, setWindowDays)}
          </div>
        </Group>
        <Group segment="dormant" text="Chodili pravidelně a teď jsou pryč mnohem déle než obvykle.">
          <div className="flex flex-wrap gap-4">
            {field('skupiny-nasobek', 'Kolikrát déle než obvykle', factor, setFactor, { decimal: true })}
            {field('skupiny-minimum', 'Nejdřív po (dnech)', minDays, setMinDays)}
          </div>
        </Group>
        <Group segment="one_time" text="Přišli jednou nebo párkrát a pravidelně nechodí. Nic se nenastavuje." />
        <Group segment="ended" text="Odhlásili se z nabídek, nebo jste spolupráci ukončili v kartě zákazníka." />

        {!readOnly && (
          <div>
            <Button type="submit" disabled={pending}>
              Uložit a přepočítat
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}

function Group({
  segment,
  text,
  children,
}: {
  segment: 'new' | 'regular' | 'dormant' | 'one_time' | 'ended'
  text: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-panel border bg-surface p-5">
      <div className="flex flex-col items-start gap-2">
        <SegmentBadge segment={segment} />
        <p className="text-sm text-quiet">{text}</p>
      </div>
      {children}
    </section>
  )
}
