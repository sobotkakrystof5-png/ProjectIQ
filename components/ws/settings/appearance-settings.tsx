'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWsUndoAction } from '@/components/ws/app/booking/use-ws-action'
import { saveAppearanceSettings } from '@/app/w/[business]/nastaveni/actions'

const DEFAULT_COLOR = '#193A6A'
const HEX = /^#[0-9a-fA-F]{6}$/

export function AppearanceSettings({ slug, color, readOnly }: { slug: string; color: string | null; readOnly: boolean }) {
  const { run, pending } = useWsUndoAction()
  const [value, setValue] = useState(color ?? DEFAULT_COLOR)
  const [savedColor, setSavedColor] = useState<string | null>(color)
  const saved = useRef<string | null>(color)

  const save = useCallback((next: string | null) => {
    const previous = saved.current
    return run(
      () => saveAppearanceSettings({ slug, color: next }),
      async () => {
        const result = await saveAppearanceSettings({ slug, color: previous })
        if (result.ok) {
          saved.current = previous
          setSavedColor(previous)
          setValue(previous ?? DEFAULT_COLOR)
        }
        return result
      },
      'Vzhled je uložený.',
      'Předchozí barva je zpátky.',
    ).then((ok) => { if (ok) { saved.current = next; setSavedColor(next) } })
  }, [run, slug])

  useEffect(() => {
    const next = value.toLowerCase()
    if (readOnly || !HEX.test(next) || next === saved.current?.toLowerCase() || (saved.current === null && next === DEFAULT_COLOR.toLowerCase())) return
    const timer = window.setTimeout(() => {
      if (next === saved.current?.toLowerCase() || (saved.current === null && next === DEFAULT_COLOR.toLowerCase())) return
      void save(next)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [value, readOnly, save])

  return <div className="flex max-w-[520px] flex-col gap-5 rounded-panel border border-navy-100 bg-surface p-5">
    <div>
      <h2 className="text-[16px] font-semibold text-ink">Akcentová barva</h2>
      <p className="mt-1 text-sm text-quiet">Použije se na objednávací stránce, v portálu a v e-mailech. Změna se uloží sama; po uložení ji můžete vrátit.</p>
    </div>
    <label className="flex items-center gap-3 text-sm font-medium text-ink">Barva
      <input aria-label="Vybrat barvu" type="color" value={value} disabled={readOnly || pending} onChange={(e) => setValue(e.target.value)} className="h-11 w-14 rounded-chip border border-input bg-surface p-1" />
      <Input value={value} maxLength={7} onChange={(e) => setValue(e.target.value)} disabled={readOnly || pending} aria-label="Kód barvy" />
    </label>
    <span className="h-12 rounded-chip px-5 py-3 text-center font-semibold text-white" style={{ backgroundColor: HEX.test(value) ? value : DEFAULT_COLOR }}>Náhled tlačítka</span>
    <div className="flex min-h-11 flex-wrap items-center gap-3">
      {savedColor !== null && <Button variant="outline" disabled={readOnly || pending} onClick={() => { setValue(DEFAULT_COLOR); void save(null) }}>Vrátit výchozí barvu</Button>}
      <p aria-live="polite" className="text-sm text-quiet">{pending ? 'Ukládám…' : 'Uloží se po dokončení změny.'}</p>
    </div>
    <p className="text-sm text-quiet">Logo zatím nenahráváme, dokud není vybrané bezpečné úložiště souborů.</p>
  </div>
}
