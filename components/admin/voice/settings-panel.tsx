'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { DeleteDictationsButton } from '@/components/admin/voice/delete-dictations'
import { saveVoiceSettings } from '@/app/voice-actions'
import { CATEGORY_LABEL, STYLE_KEYS, STYLE_LABEL, VOICE_CATEGORIES, type VoiceCategory, type VoiceStyle } from '@/lib/admin/voice/categories'
import type { VoiceSettings } from '@/lib/admin/voice/store'
import { formatDictations } from '@/lib/admin/voice/stats'

/**
 * Nastavení ZakazIQ Voice (VO10): styl podle kategorie, čištění a učení,
 * rychlost psaní, uchovávání textu (D-V7) a mazání diktátů. Jedno tlačítko
 * Uložit pro celý formulář; mazání je zvlášť, protože nejde vrátit.
 */

type Keep = 'forever' | 'days' | 'numbers'

const fieldLabel = 'mb-1 block text-sm font-medium text-ink'
const select =
  'h-11 w-full rounded-full border border-input bg-surface px-4 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-[44px] items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-quiet">{hint}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-1" />
    </div>
  )
}

export function VoiceSettingsForm({ settings }: { settings: VoiceSettings }) {
  const [styles, setStyles] = useState<Record<VoiceCategory, VoiceStyle>>(settings.styles)
  const [cleanup, setCleanup] = useState(settings.cleanupEnabled)
  const [autoLearn, setAutoLearn] = useState(settings.autoLearnTerms)
  const [wpm, setWpm] = useState(String(settings.typingWpm))
  const [cap, setCap] = useState(String(settings.dailyCostCapUsd))
  const [keep, setKeep] = useState<Keep>(!settings.storeText ? 'numbers' : settings.textRetentionDays ? 'days' : 'forever')
  const [days, setDays] = useState(String(settings.textRetentionDays ?? 90))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await saveVoiceSettings({
        styles,
        cleanupEnabled: cleanup,
        autoLearnTerms: autoLearn,
        typingWpm: Number.parseInt(wpm, 10),
        dailyCostCapUsd: Number.parseFloat(cap.replace(',', '.')),
        storeText: keep !== 'numbers',
        textRetentionDays: keep === 'days' ? Number.parseInt(days, 10) : null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success('Nastavení uloženo.')
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <Card>
        <CardHead title="Styl podle kategorie" hint="Jak má čištění upravit text podle aplikace, do které diktujete." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {VOICE_CATEGORIES.map((c) => (
            <label key={c} className="text-sm">
              <span className={fieldLabel}>{CATEGORY_LABEL[c]}</span>
              <select
                value={styles[c]}
                onChange={(e) => setStyles({ ...styles, [c]: e.target.value as VoiceStyle })}
                className={select}
              >
                {STYLE_KEYS.map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Čištění a učení" />
        <div className="space-y-4">
          <Toggle
            id="voice-cleanup"
            label="Čistit text"
            hint="Odstraní „ehm“, opraví čárky a samoopravy. Vypnuté = vloží se přepis beze změn."
            checked={cleanup}
            onChange={setCleanup}
          />
          <Toggle
            id="voice-learn"
            label="Učit se slova samo"
            hint="Po třech stejných opravách přidá slovo do slovníku. Vypnuté = slova chodí jako návrhy."
            checked={autoLearn}
            onChange={setAutoLearn}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className={fieldLabel}>Denní strop nákladů (USD)</span>
              <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" className="h-11" />
              <span className="mt-1 block text-xs text-quiet">Nad ním se vkládá jen přepis bez čištění.</span>
            </label>
            <label className="text-sm">
              <span className={fieldLabel}>Jak rychle píšete (slov za minutu)</span>
              <Input value={wpm} onChange={(e) => setWpm(e.target.value)} inputMode="numeric" className="h-11" />
              <span className="mt-1 block text-xs text-quiet">Z toho se počítá ušetřený čas.</span>
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Uchovávat text" hint="Zvuk se nikdy neukládá. Tady nastavíte, co se stane s textem diktátů." />
        <fieldset className="space-y-2">
          <legend className="sr-only">Uchovávat text</legend>
          {(
            [
              ['forever', 'Natrvalo', 'Text zůstane, dokud ho nesmažete.'],
              ['days', 'Smazat po určité době', 'Text starší než lhůta se smaže, zůstanou čísla.'],
              ['numbers', 'Jen čísla', 'Nové diktáty se uloží bez textu. Starší smažete níž nebo v Historii.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-chip px-2 py-2 hover:bg-navy-50">
              <input
                type="radio"
                name="voice-keep"
                value={value}
                checked={keep === value}
                onChange={() => setKeep(value)}
                className="mt-1 h-4 w-4 shrink-0 accent-navy-700"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-quiet">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {keep === 'days' && (
          <label className="mt-3 block max-w-xs text-sm">
            <span className={fieldLabel}>Po kolika dnech</span>
            <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="h-11" />
          </label>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          Uložit nastavení
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </form>
  )
}

export function VoiceDeleteCard({ dictations }: { dictations: number }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  return (
    <Card>
      <CardHead title="Smazat diktáty" hint={`Uloženo ${formatDictations(dictations)}. S diktátem zmizí i jeho opravy. Vrátit to nejde.`} />
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm">
            <span className={fieldLabel}>Od</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
          </label>
          <label className="text-sm">
            <span className={fieldLabel}>Do</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
          </label>
          <DeleteDictationsButton scope={{ kind: 'range', from, to }} label="Smazat období" disabled={!from || !to} />
        </div>
        <div className="border-t border-navy-100 pt-4">
          <DeleteDictationsButton scope={{ kind: 'all' }} label="Smazat všechny diktáty" disabled={dictations === 0} />
        </div>
      </div>
    </Card>
  )
}
