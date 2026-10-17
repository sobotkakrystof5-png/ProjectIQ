'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { undoToast, useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { addTimeOff, changeStaffActive, saveHoursSettings, saveStaffSettings } from '@/app/w/[business]/nastaveni/actions'
import { cancelAppointment, restoreAppointment } from '@/app/w/[business]/poptavky/actions'
import { summarizeWeek, type Week } from '@/lib/ws/hours'
import { cn } from '@/lib/ws/utils'
import { SortableList } from './sortable-list'
import { WeekHoursEditor } from './week-hours-editor'

const copyWeek = (week: Week): Week => week.map((d) => d.map((r) => ({ ...r })))
const same = (a: Week, b: Week) => JSON.stringify(a) === JSON.stringify(b)

// --- Otevírací doba firmy ------------------------------------------------------

export function BusinessHoursForm({ slug, week, readOnly }: { slug: string; week: Week; readOnly: boolean }) {
  const { run, pending } = useWsAction()
  const [draft, setDraft] = useState(() => copyWeek(week))
  const empty = draft.every((d) => !d.length)
  const save = () => void run(() => saveHoursSettings({ slug, staffId: null, week: draft }), () => toast.success(empty ? 'Otevírací doba je smazaná. Zákazníci si čas navrhnou sami.' : 'Otevírací doba je uložená. Objednávání nabízí jen volné časy.'))

  return <section className="flex flex-col gap-3 rounded-panel border bg-surface p-5">
    <div>
      <h2 className="text-[16px] font-semibold text-ink">Otevírací doba</h2>
      <p className="mt-0.5 text-sm text-quiet">Podle ní objednávací stránka nabízí volné časy. Když žádný den nezapnete, zákazníci si čas navrhnou sami a vy ho potvrdíte.</p>
    </div>
    <WeekHoursEditor idPrefix="firma" value={draft} onChange={setDraft} disabled={readOnly || pending} />
    <Button className="self-start" disabled={readOnly || pending || same(draft, week)} onClick={save}>Uložit otevírací dobu</Button>
  </section>
}

// --- Pracovníci a směny --------------------------------------------------------

export type StaffItem = { id: string; name: string; active: boolean; shifts: Week | null }

export function StaffSettings({ slug, staff, businessWeek, readOnly }: { slug: string; staff: StaffItem[]; businessWeek: Week; readOnly: boolean }) {
  const { run, pending } = useWsAction()
  const [open, setOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const add = () => {
    if (!name.trim()) { toast.error('Napište jméno pracovníka.'); return }
    void run(() => saveStaffSettings({ slug, name }), () => { setName(''); toast.success('Pracovník je přidaný. Zatím pracuje podle otevírací doby.') })
  }

  return <section className="flex flex-col gap-3 rounded-panel border bg-surface p-5">
    <div>
      <h2 className="text-[16px] font-semibold text-ink">Pracovníci</h2>
      <p className="mt-0.5 text-sm text-quiet">Kdo bere termíny. Se dvěma a více uvidíte v kalendáři sloupec pro každého. Pořadí změníte přetažením.</p>
    </div>
    {staff.length ? <SortableList slug={slug} kind="staff" items={staff} nameOf={(s) => s.name} disabled={readOnly} itemClassName="rounded-box border bg-surface">
      {(s, handle) => <StaffRow slug={slug} staff={s} handle={handle} businessWeek={businessWeek} readOnly={readOnly} expanded={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />}
    </SortableList> : <p className="text-sm text-quiet">Zatím tu nikdo není. Přidejte sebe nebo kolegyni, ať můžete termíny rozdělit.</p>}
    <fieldset disabled={readOnly || pending} className="flex flex-col gap-2 border-t border-navy-100 pt-4 sm:flex-row">
      <legend className="sr-only">Přidat pracovníka</legend>
      <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="Jméno, například Jana" aria-label="Jméno nového pracovníka" />
      <Button variant="outline" onClick={add}>Přidat pracovníka</Button>
    </fieldset>
  </section>
}

function StaffRow({ slug, staff, handle, businessWeek, readOnly, expanded, onToggle }: { slug: string; staff: StaffItem; handle: ReactNode; businessWeek: Week; readOnly: boolean; expanded: boolean; onToggle: () => void }) {
  const { run, pending } = useWsAction()
  const [name, setName] = useState(staff.name)
  const [own, setOwn] = useState(staff.shifts !== null)
  const [week, setWeek] = useState(() => copyWeek(staff.shifts ?? businessWeek))
  const summary = staff.shifts ? summarizeWeek(staff.shifts) ?? 'Bez směn' : 'Podle otevírací doby'
  const shiftsChanged = own !== (staff.shifts !== null) || (own && staff.shifts !== null && !same(week, staff.shifts))
  const saveShifts = () => void run(() => saveHoursSettings({ slug, staffId: staff.id, week: own ? week : null }), () => toast.success(own ? 'Směny jsou uložené.' : `${staff.name} pracuje podle otevírací doby.`))

  return <div className="flex flex-col">
    <div className="flex min-h-[60px] items-center gap-2 px-4 py-2">
      {handle}
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold', staff.active ? 'text-ink' : 'text-quiet')}>{staff.name}{staff.active ? '' : ' · nebere termíny'}</p>
        <p className={cn('text-quiet', staff.shifts ? 'font-num text-[13px]' : 'text-sm')}>{summary}</p>
      </div>
      <Button variant="ghost" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Zavřít' : 'Upravit'}</Button>
    </div>
    {expanded && <fieldset disabled={readOnly || pending} className="flex flex-col gap-4 border-t border-navy-100 px-4 py-4">
      <legend className="sr-only">Upravit: {staff.name}</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Jméno" />
        <Button variant="outline" disabled={!name.trim() || name.trim() === staff.name} onClick={() => void run(() => saveStaffSettings({ slug, id: staff.id, name }), () => toast.success('Jméno je uložené.'))}>Uložit jméno</Button>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <label htmlFor={`aktivni-${staff.id}`} className="text-[15px]"><span className="font-medium text-ink">Bere nové termíny</span><span className="block text-sm text-quiet">Vypnutím ho schováte z nabídky. Dřívější termíny zůstanou.</span></label>
        <Switch id={`aktivni-${staff.id}`} checked={staff.active} onCheckedChange={(active) => void run(() => changeStaffActive({ slug, id: staff.id, active }), () => toast.success(active ? `${staff.name} zase bere termíny.` : `${staff.name} je schovaný. Dřívější termíny zůstaly.`))} />
      </div>
      <div role="radiogroup" aria-label="Kdy pracuje" className="flex flex-col gap-1">
        <p className="text-[15px] font-medium text-ink">Kdy pracuje</p>
        {[{ value: false, label: 'Podle otevírací doby firmy' }, { value: true, label: 'Vlastní směny' }].map((o) => <label key={String(o.value)} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input type="radio" name={`smeny-${staff.id}`} className="h-5 w-5 accent-navy-700" checked={own === o.value} onChange={() => { setOwn(o.value); if (o.value && staff.shifts === null) setWeek(copyWeek(businessWeek)) }} />
          {o.label}
        </label>)}
      </div>
      {own && <WeekHoursEditor idPrefix={`smena-${staff.id}`} value={week} onChange={setWeek} disabled={readOnly || pending} />}
      <Button className="self-start" disabled={!shiftsChanged} onClick={saveShifts}>Uložit směny</Button>
    </fieldset>}
  </div>
}

// --- Dovolené a zavřeno ----------------------------------------------------------

export type TimeOffItem = { id: string; who: string; title: string; when: string }

export function TimeOffSettings({ slug, items, staff, today, readOnly }: { slug: string; items: TimeOffItem[]; staff: { id: string; name: string }[]; today: string; readOnly: boolean }) {
  const { run, pending } = useWsAction()
  const [who, setWho] = useState('')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [title, setTitle] = useState('Dovolená')
  const add = () => {
    if (!from || !to || to < from) { toast.error('Den „do“ musí být stejný nebo pozdější než „od“.'); return }
    void run(() => addTimeOff({ slug, staffId: who || null, from, to, title }), () => toast.success('Volno je v kalendáři. V těch dnech se nenabízí žádný čas.'))
  }
  const remove = (item: TimeOffItem) => void run(() => cancelAppointment({ slug, appointmentId: item.id }), () => undoToast('Volno je zrušené.', () => restoreAppointment({ slug, appointmentId: item.id }), { done: 'Volno je zpátky.' }))

  return <section className="flex flex-col gap-3 rounded-panel border bg-surface p-5">
    <div>
      <h2 className="text-[16px] font-semibold text-ink">Dovolené a zavřeno</h2>
      <p className="mt-0.5 text-sm text-quiet">V těchto dnech objednávání nenabídne žádný čas. Kratší blokaci, třeba na hodinu, přidáte rovnou v kalendáři.</p>
    </div>
    {items.length ? <ul className="flex flex-col divide-y divide-navy-100">
      {items.map((x) => <li key={x.id} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{x.who} · {x.title}</p>
          <p className="font-num text-[13px] text-quiet">{x.when}</p>
        </div>
        <Button variant="ghost" disabled={readOnly || pending} onClick={() => remove(x)}>Zrušit</Button>
      </li>)}
    </ul> : <p className="text-sm text-quiet">Žádné volno není naplánované.</p>}
    <fieldset disabled={readOnly || pending} className="grid gap-3 border-t border-navy-100 pt-4 sm:grid-cols-2">
      <legend className="sr-only">Přidat volno</legend>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Kdo
        <select className="h-11 rounded-chip border border-input bg-surface px-3.5 text-[15px]" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Celá firma (zavřeno)</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Důvod<Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Od<Input type="date" value={from} min={today} className="font-num" onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Do (včetně)<Input type="date" value={to} min={from} className="font-num" onChange={(e) => setTo(e.target.value)} /></label>
      <Button variant="outline" className="sm:col-span-2 sm:justify-self-start" onClick={add}>Přidat volno</Button>
    </fieldset>
  </section>
}
