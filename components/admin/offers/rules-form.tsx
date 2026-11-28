'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { savePricingRulesAction } from '@/app/offer-proposal-actions'
import {
  DEFAULT_PRICING_RULES,
  VARIANT_KEYS,
  VARIANT_NAMES,
  bandLabel,
  jobBandLabel,
  type PricingRules,
  type VariantKey,
  type VariantRanges,
} from '@/lib/admin/offers/pricing'

/**
 * Cenová pravidla navrhovače nabídek (R-147, oddíl 5 plánu). Uložení = nová
 * verze; nabídky, které už odešly, se nemění. „Vrátit výchozí" jen vyplní
 * formulář tabulkou z plánu, uloží se až tlačítkem.
 */

const num = 'min-h-11 w-full rounded-chip border border-navy-200 bg-surface px-3 font-num text-sm text-ink focus:border-navy-700 focus:outline-none'
const area = 'w-full resize-y rounded-chip border border-navy-200 bg-surface px-3 py-2 text-sm leading-6 text-ink focus:border-navy-700 focus:outline-none'

const toInt = (s: string) => {
  const n = Number(s.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')

function RangeInputs({
  ranges,
  onChange,
  label,
}: {
  ranges: VariantRanges
  onChange: (key: VariantKey, edge: 'min' | 'max', value: number) => void
  label: string
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {VARIANT_KEYS.map((key) => (
        <fieldset key={key} className="flex flex-col gap-1.5">
          <legend className="text-xs text-quiet">{VARIANT_NAMES[key]}</legend>
          <div className="flex items-center gap-2">
            <input
              aria-label={`${label}, ${VARIANT_NAMES[key]}, od`}
              inputMode="numeric"
              value={ranges[key].min}
              onChange={(e) => onChange(key, 'min', toInt(e.target.value))}
              className={num}
            />
            <span className="text-quiet">–</span>
            <input
              aria-label={`${label}, ${VARIANT_NAMES[key]}, do`}
              inputMode="numeric"
              value={ranges[key].max}
              onChange={(e) => onChange(key, 'max', toInt(e.target.value))}
              className={num}
            />
          </div>
        </fieldset>
      ))}
    </div>
  )
}

export function RulesForm({ rules: initial, stored, updatedAt }: { rules: PricingRules; stored: boolean; updatedAt: string | null }) {
  const router = useRouter()
  const [rules, setRules] = useState(initial)
  const [texts, setTexts] = useState(() => textState(initial))
  const [pending, start] = useTransition()

  const setBand = (i: number, key: VariantKey, edge: 'min' | 'max', value: number) =>
    setRules((r) => ({
      ...r,
      bands: r.bands.map((b, j) => (j === i ? { ...b, ranges: { ...b.ranges, [key]: { ...b.ranges[key], [edge]: value } } } : b)),
    }))
  const setUpTo = (i: number, key: 'upTo' | 'jobUpTo', value: number) =>
    setRules((r) => ({ ...r, bands: r.bands.map((b, j) => (j === i ? { ...b, [key]: value } : b)) }))
  const setEshop = (key: VariantKey, edge: 'min' | 'max', value: number) =>
    setRules((r) => ({ ...r, eshop: { ...r.eshop, [key]: { ...r.eshop[key], [edge]: value } } }))
  const setField = (key: keyof PricingRules, value: number) => setRules((r) => ({ ...r, [key]: value }))

  const save = () =>
    start(async () => {
      const payload: PricingRules = {
        ...rules,
        includes: { zaklad: lines(texts.zaklad), doporucena: lines(texts.doporucena), plus: lines(texts.plus) },
        eshopIncludes: { zaklad: lines(texts.eZaklad), doporucena: lines(texts.eDoporucena), plus: lines(texts.ePlus) },
        always: lines(texts.always),
        managementIncludes: lines(texts.management),
      }
      const res = await savePricingRulesAction(payload)
      if (!res.ok) {
        toast.error('Pravidla se neuložila', { description: res.error })
        return
      }
      setRules(res.rules)
      toast.success(`Uloženo jako verze ${res.rules.version}`, { description: 'Platí pro nové nabídky, odeslané se nemění.' })
      router.refresh()
    })

  const reset = () => {
    setRules({ ...DEFAULT_PRICING_RULES, version: rules.version })
    setTexts(textState(DEFAULT_PRICING_RULES))
    toast.message('Formulář má výchozí hodnoty z plánu', { description: 'Uloží se, až kliknete na Uložit pravidla.' })
  }

  const numberField = (key: keyof PricingRules, label: string, suffix: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <input inputMode="numeric" value={rules[key] as number} onChange={(e) => setField(key, toInt(e.target.value))} className={num} />
        <span className="shrink-0 text-sm text-quiet">{suffix}</span>
      </div>
    </label>
  )

  const textField = (key: keyof ReturnType<typeof textState>, label: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <textarea value={texts[key]} onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))} rows={4} className={area} />
    </label>
  )

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-quiet">
        {stored && updatedAt
          ? `Verze ${rules.version}, uloženo ${new Date(updatedAt).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' })}.`
          : 'Zatím platí výchozí pravidla z plánu (tabulka pásem z 25. 11.).'}
      </p>

      <Card>
        <CardHead
          title="Pásma podle toho, co web klientovi přinese za měsíc"
          hint="Přínos = zakázky z webu za měsíc × cena jedné zakázky. Když počet zakázek odhadnout nejde, pásmo se vybere podle ceny jedné zakázky. Kde v pásmu firma je, navrhne rozbor firmy. Ceny se zaokrouhlí na celé tisíce."
        />
        <div className="flex flex-col gap-6">
          {rules.bands.map((band, i) => (
            <div key={i} className="flex flex-col gap-3 border-t border-navy-100 pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-ink">{bandLabel(rules, i)}</p>
                <p className="text-sm text-quiet">Bez počtu zakázek: {jobBandLabel(rules, i)}</p>
              </div>
              {band.upTo !== null && band.jobUpTo !== null && (
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <label className="flex flex-wrap items-center gap-2 text-sm text-quiet">
                    Přínos pod
                    <input
                      inputMode="numeric"
                      value={band.upTo}
                      onChange={(e) => setUpTo(i, 'upTo', toInt(e.target.value))}
                      className={`${num} w-36`}
                    />
                    Kč měsíčně
                  </label>
                  <label className="flex flex-wrap items-center gap-2 text-sm text-quiet">
                    Zakázka pod
                    <input
                      inputMode="numeric"
                      value={band.jobUpTo}
                      onChange={(e) => setUpTo(i, 'jobUpTo', toInt(e.target.value))}
                      className={`${num} w-36`}
                    />
                    Kč
                  </label>
                </div>
              )}
              <RangeInputs ranges={band.ranges} label={bandLabel(rules, i)} onChange={(k, edge, v) => setBand(i, k, edge, v)} />
            </div>
          ))}
          <div className="flex flex-col gap-3 border-t border-navy-100 pt-4">
            <p className="text-sm font-semibold text-ink">E-shop (mimo pásma)</p>
            <RangeInputs ranges={rules.eshop} label="E-shop" onChange={setEshop} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Hranice a příplatky" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {numberField('floor', 'Web nejméně za', 'Kč')}
          {numberField('confirmAbove', 'Potvrdit cenu nad', 'Kč')}
          {numberField('rushPercent', 'Spěch', '%')}
          {numberField('languagePercent', 'Každý další jazyk', '%')}
          {numberField('managementMonthly', 'Správa webu', 'Kč měsíčně')}
          {numberField('depositPercent', 'Záloha předem', '%')}
          {numberField('validityDays', 'Nabídka platí', 'dní')}
        </div>
      </Card>

      <Card>
        <CardHead title="Co varianta obsahuje" hint="Jeden řádek = jedna položka na stránce nabídky. Rozbor k tomu přidá položky šité na firmu." />
        <div className="grid gap-4 md:grid-cols-3">
          {textField('zaklad', 'Základ (web)')}
          {textField('doporucena', 'Doporučená (web)')}
          {textField('plus', 'Plus (web)')}
          {textField('eZaklad', 'Základ (e-shop)')}
          {textField('eDoporucena', 'Doporučená (e-shop)')}
          {textField('ePlus', 'Plus (e-shop)')}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {textField('always', 'V ceně je vždy')}
          {textField('management', 'Co je ve správě webu')}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          Uložit pravidla
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-full border border-navy-200 px-4 text-sm font-medium text-ink hover:bg-navy-50"
        >
          Vrátit výchozí
        </button>
      </div>
    </div>
  )
}

function textState(r: PricingRules) {
  return {
    zaklad: r.includes.zaklad.join('\n'),
    doporucena: r.includes.doporucena.join('\n'),
    plus: r.includes.plus.join('\n'),
    eZaklad: r.eshopIncludes.zaklad.join('\n'),
    eDoporucena: r.eshopIncludes.doporucena.join('\n'),
    ePlus: r.eshopIncludes.plus.join('\n'),
    always: r.always.join('\n'),
    management: r.managementIncludes.join('\n'),
  }
}
