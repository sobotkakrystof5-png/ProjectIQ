'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { saveAppearanceSettings } from '@/app/w/[business]/nastaveni/actions'
export function AppearanceSettings({ slug, color, readOnly }: { slug: string; color: string | null; readOnly: boolean }) { const { run, pending } = useWsAction(); const [value,setValue] = useState(color ?? '#193A6A'); return <div className="flex max-w-[520px] flex-col gap-5 rounded-panel border bg-surface p-5"><div><h2 className="text-[16px] font-semibold">Akcentová barva</h2><p className="mt-1 text-sm text-quiet">Použije se na objednávací stránce, v portálu a v e-mailech. Hlídáme čitelnost bílého textu.</p></div><label className="flex items-center gap-3 text-sm font-medium">Barva <input aria-label="Vybrat barvu" type="color" value={value} disabled={readOnly || pending} onChange={(e) => setValue(e.target.value)} className="h-11 w-14 rounded-chip border border-input bg-surface p-1"/><Input value={value} maxLength={7} onChange={(e) => setValue(e.target.value)} disabled={readOnly || pending}/></label><span className="h-12 rounded-chip px-5 py-3 text-center font-semibold text-white" style={{backgroundColor:value}}>Náhled tlačítka</span><Button disabled={readOnly || pending} onClick={() => void run(() => saveAppearanceSettings({slug,color:value}), () => toast.success('Vzhled je uložený.'))}>Uložit barvu</Button><p className="text-sm text-quiet">Logo zatím nenahráváme, dokud není vybrané bezpečné úložiště souborů.</p></div> }
