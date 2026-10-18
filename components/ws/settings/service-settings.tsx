'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { undoToast, useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { hideService, saveServiceSettings } from '@/app/w/[business]/nastaveni/actions'
import { hasWholeMinor } from '@/lib/ws/money'
import { cn } from '@/lib/ws/utils'
import { SortableList } from './sortable-list'

type Service = { id: string; name: string; duration_min: number; price: string | null; currency: string; active: boolean; show_on_web: boolean; buffer_min: number }
type Staff = { id: string; name: string }
type Draft = { name: string; duration: string; price: string; buffer: string; showOnWeb: boolean; staffIds: string[] }

const formatPrice = (price: string) => { const n = Number(price); return n.toLocaleString('cs-CZ', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) }
const emptyDraft: Draft = { name: '', duration: '60', price: '', buffer: '0', showOnWeb: true, staffIds: [] }

/** Kontrola formuláře; null = chybu už ukázal toast. */
function parse(d: Draft) {
  const price = d.price.trim() ? Number(d.price.replace(',', '.').replace(/\s/g, '')) : null
  const duration = Number(d.duration)
  const buffer = Number(d.buffer || 0)
  if (!d.name.trim()) { toast.error('Napište název služby.'); return null }
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) { toast.error('Délka musí být celé číslo od 5 do 1440 minut.'); return null }
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 240) { toast.error('Rozestup může být 0 až 240 minut.'); return null }
  if (price !== null && (!Number.isFinite(price) || price < 0 || !hasWholeMinor(price))) { toast.error('Cenu napište jako číslo, třeba 450 nebo 450,50.'); return null }
  return { name: d.name, duration, price, buffer, showOnWeb: d.showOnWeb, currency: 'CZK' }
}

export function ServiceSettings({ slug, services, staff, serviceStaff, readOnly }: { slug: string; services: Service[]; staff: Staff[]; serviceStaff: { service_id: string; staff_id: string }[]; readOnly: boolean }) {
  const { run, pending } = useWsAction()
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const assigned = (serviceId: string) => serviceStaff.filter((x) => x.service_id === serviceId && staff.some((s) => s.id === x.staff_id)).map((x) => x.staff_id)
  const add = () => {
    const input = parse(draft); if (!input) return
    void run(() => saveServiceSettings({ slug, ...input, staffIds: staff.length > 1 ? draft.staffIds : undefined }), () => { setDraft(emptyDraft); toast.success('Služba je uložená.') })
  }

  return <div className="flex flex-col gap-6">
    {services.length ? <SortableList slug={slug} kind="services" items={services} nameOf={(s) => s.name} disabled={readOnly} itemClassName="rounded-panel border bg-surface">
      {(s, handle) => <ServiceRow slug={slug} service={s} handle={handle} staff={staff} assigned={assigned(s.id)} readOnly={readOnly} expanded={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />}
    </SortableList> : <p className="rounded-panel border bg-surface px-5 py-4 text-[15px] text-quiet">Zatím tu žádná služba není. Přidejte první, třeba konzultaci nebo střih, a zákazníci si ji vyberou při objednání.</p>}
    <fieldset disabled={readOnly || pending} className="flex flex-col gap-4 rounded-panel border bg-surface p-5">
      <legend className="px-1 text-[16px] font-semibold">Přidat službu</legend>
      <ServiceFields draft={draft} onChange={setDraft} staff={staff} idPrefix="nova" />
      <Button className="self-start" onClick={add}>Přidat službu</Button>
    </fieldset>
  </div>
}

function ServiceRow({ slug, service: s, handle, staff, assigned, readOnly, expanded, onToggle }: { slug: string; service: Service; handle: ReactNode; staff: Staff[]; assigned: string[]; readOnly: boolean; expanded: boolean; onToggle: () => void }) {
  const { run, pending } = useWsAction()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>({ name: s.name, duration: String(s.duration_min), price: s.price === null ? '' : formatPrice(s.price).replace(/\s/g, ''), buffer: String(s.buffer_min), showOnWeb: s.show_on_web, staffIds: assigned })
  const who = staff.length > 1 && assigned.length ? staff.filter((x) => assigned.includes(x.id)).map((x) => x.name).join(', ') : null
  const save = () => {
    const input = parse(draft); if (!input) return
    void run(() => saveServiceSettings({ slug, id: s.id, ...input, staffIds: staff.length > 1 ? draft.staffIds : undefined }), () => { onToggle(); toast.success('Služba je uložená.') })
  }

  return <div className="flex flex-col">
    <div className="flex min-h-[64px] items-center gap-1 py-3 pl-4 pr-3 sm:gap-2 sm:px-5">
      {handle}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold', s.active ? 'text-ink' : 'text-quiet')}>{s.name}{s.active ? '' : ' · skrytá'}</p>
        <p className="text-sm text-quiet"><span className="font-num">{s.duration_min} min{s.buffer_min ? ` + ${s.buffer_min} min rozestup` : ''}{s.price !== null ? ` · ${formatPrice(s.price)} ${s.currency === 'CZK' ? 'Kč' : s.currency}` : ''}</span>{!s.show_on_web ? ' · jen uvnitř aplikace' : ''}{who ? ` · dělá ${who}` : ''}</p>
      </div>
      <Button variant="ghost" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Zavřít' : 'Upravit'}</Button>
      <Switch checked={s.active} disabled={readOnly || pending} aria-label={s.active ? `Skrýt službu ${s.name}` : `Znovu nabízet službu ${s.name}`} onCheckedChange={(active) => void run(
        () => hideService({ slug, id: s.id, active }),
        () => undoToast(active ? 'Služba je znovu vidět.' : 'Služba je skrytá. Dřívější termíny zůstaly uložené.', () => hideService({ slug, id: s.id, active: s.active }), {
          done: s.active ? 'Služba je znovu vidět.' : 'Služba je skrytá.',
          refresh: () => router.refresh(),
        }),
      )} />
    </div>
    {expanded && <fieldset disabled={readOnly || pending} className="flex flex-col gap-4 border-t border-navy-100 px-5 py-4">
      <legend className="sr-only">Upravit službu {s.name}</legend>
      <ServiceFields draft={draft} onChange={setDraft} staff={staff} idPrefix={s.id} />
      <Button className="self-start" onClick={save}>Uložit službu</Button>
    </fieldset>}
  </div>
}

function ServiceFields({ draft, onChange, staff, idPrefix }: { draft: Draft; onChange: (d: Draft) => void; staff: Staff[]; idPrefix: string }) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">Název<Input value={draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="Například konzultace" /></label>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Délka v minutách<Input inputMode="numeric" className="font-num" value={draft.duration} onChange={(e) => set({ duration: e.target.value })} /></label>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Cena v Kč, nepovinně<Input inputMode="decimal" className="font-num" value={draft.price} onChange={(e) => set({ price: e.target.value })} /></label>
    <label className="flex flex-col gap-1.5 text-sm font-medium">Rozestup po službě v minutách<Input inputMode="numeric" className="font-num" value={draft.buffer} onChange={(e) => set({ buffer: e.target.value })} /><span className="font-normal text-quiet">Čas na úklid nebo cestu. Další zákazník se objedná až po něm.</span></label>
    <div className="flex min-h-11 items-center justify-between gap-3 self-start sm:pt-6"><Label htmlFor={`${idPrefix}-web`}>Nabízet na webu</Label><Switch id={`${idPrefix}-web`} checked={draft.showOnWeb} onCheckedChange={(v) => set({ showOnWeb: v })} /></div>
    {staff.length > 1 && <div className="flex flex-col gap-1 sm:col-span-2">
      <p className="text-sm font-medium text-ink">Kdo ji dělá</p>
      <p className="text-sm text-quiet">Když nikoho nevyberete, dělá ji kdokoli.</p>
      <div className="mt-1 flex flex-wrap gap-x-6">
        {staff.map((x) => <label key={x.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
          <Checkbox checked={draft.staffIds.includes(x.id)} onCheckedChange={(v) => set({ staffIds: v === true ? [...draft.staffIds, x.id] : draft.staffIds.filter((y) => y !== x.id) })} />
          {x.name}
        </label>)}
      </div>
    </div>}
  </div>
}
