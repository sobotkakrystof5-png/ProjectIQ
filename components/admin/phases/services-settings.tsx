'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical, Loader2, Plus, X } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHead, SECTION_LABEL } from '@/components/admin/card'
import { cn } from '@/lib/utils'
import { PHASE_FORMS, SUGGESTED_SERVICES, plural, tasksFromLines, type ServiceInput, type ServiceTemplate } from '@/lib/admin/phase-model'
import {
  addServiceAction,
  addSuggestedServicesAction,
  deleteServiceAction,
  restoreServiceAction,
  saveServiceAction,
} from '@/app/phases-actions'

// Nastavení › Služby (KP12, R-121). Obsah píše Kryštof — komponenta nic
// nevymýšlí, jen ukládá. Etapy se řadí přetažením (myš, prst za úchyt,
// klávesnice) a ukládají se tlačítkem s celou službou.

const inputCls =
  'w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

export function ServicesSettings({ services }: { services: ServiceTemplate[] }) {
  return (
    <div className="space-y-4">
      {services.length === 0 ? <EmptyState /> : services.map((s) => <ServiceCard key={s.id} service={s} />)}
      <AddService />
    </div>
  )
}

function EmptyState() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const create = () =>
    start(async () => {
      const res = await addSuggestedServicesAction()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Služby jsou založené. Teď jim doplňte etapy.')
      router.refresh()
    })

  return (
    <Card>
      <CardHead title="Zatím žádné služby" />
      <div className="max-w-prose space-y-3 text-sm text-ink">
        <p>
          Služba je druh práce, kterou děláte. Ke každé si jednou napíšete etapy, jak dlouho obvykle trvají
          a co od klienta potřebujete. U nové zakázky pak vyberete službu a etapy s termíny se vyplní samy.
        </p>
        <p className="text-quiet">Klient etapy a svoje úkoly uvidí v klientském prostoru.</p>
      </div>
      <Button type="button" className="mt-5" onClick={create} disabled={pending}>
        {pending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
        Založit {SUGGESTED_SERVICES.slice(0, -1).join(', ')} a {SUGGESTED_SERVICES[SUGGESTED_SERVICES.length - 1]}
      </Button>
      <p className="mt-2 text-xs text-quiet">Založí se prázdné, etapy do nich napíšete sami.</p>
    </Card>
  )
}

function AddService() {
  const router = useRouter()
  const id = useId()
  const [name, setName] = useState('')
  const [pending, start] = useTransition()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await addServiceAction(name)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setName('')
      toast.success('Služba je přidaná.')
      router.refresh()
    })
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink">Nová služba</label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="Název, třeba Logo a vizuální styl"
          className={inputCls}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
        Přidat službu
      </Button>
    </form>
  )
}

interface Row {
  key: string
  name: string
  description: string
  days: string
  tasksText: string
}

let seq = 0
const newKey = () => `sablona-${Date.now().toString(36)}-${(seq++).toString(36)}`

const toRows = (s: ServiceTemplate): Row[] =>
  s.phases.map((p) => ({
    key: newKey(),
    name: p.name,
    description: p.description,
    days: p.typicalDays === null ? '' : String(p.typicalDays),
    tasksText: p.tasks.join('\n'),
  }))

function toInput(name: string, active: boolean, rows: Row[]): ServiceInput | string {
  const phases: ServiceInput['phases'] = []
  for (const [i, r] of rows.entries()) {
    if (!r.name.trim()) return `Etapa ${i + 1} nemá název.`
    const days = r.days.trim() === '' ? null : Number(r.days)
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) return `Etapa ${i + 1}: délka je celý počet dní od 0 do 365.`
    phases.push({ name: r.name.trim(), description: r.description.trim(), typicalDays: days, tasks: tasksFromLines(r.tasksText) })
  }
  return { name: name.trim(), active, phases }
}

function ServiceCard({ service }: { service: ServiceTemplate }) {
  const router = useRouter()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(service.name)
  const [active, setActive] = useState(service.active)
  const [rows, setRows] = useState<Row[]>(() => toRows(service))
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()

  // Po uložení nebo „Zpět" přijdou ze serveru nová data — formulář je převezme.
  // Klíč z obsahu, ne objekt: uložení jiné služby nesmí smazat rozepsané změny tady.
  const serverKey = JSON.stringify(service)
  useEffect(() => {
    const fresh = JSON.parse(serverKey) as ServiceTemplate
    setName(fresh.name)
    setActive(fresh.active)
    setRows(toRows(fresh))
    setDirty(false)
  }, [serverKey])

  const edit = (next: Row[]) => {
    setRows(next)
    setDirty(true)
  }
  const update = (key: string, patch: Partial<Row>) => edit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: string) => {
    const before = rows
    edit(rows.filter((r) => r.key !== key))
    toast.message('Etapa odebrána. Uloží se se službou.', { undo: () => setRows(before) })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    if (!over || a.id === over.id) return
    const from = rows.findIndex((r) => r.key === a.id)
    const to = rows.findIndex((r) => r.key === over.id)
    edit(arrayMove(rows, from, to))
  }
  const nameOf = (key: unknown) => rows.find((r) => r.key === key)?.name || 'etapa'
  const posOf = (key: unknown) => rows.findIndex((r) => r.key === key) + 1

  const save = () => {
    const input = toInput(name, active, rows)
    if (typeof input === 'string') {
      toast.error(input)
      return
    }
    start(async () => {
      const res = await saveServiceAction(service.id, input)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setDirty(false)
      toast.success(`Služba ${input.name} je uložená.`, { description: 'Běžící zakázky se nemění, platí pro nové.' })
      router.refresh()
    })
  }

  const destroy = () =>
    start(async () => {
      const res = await deleteServiceAction(service.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      router.refresh()
      toast.success(`Služba ${service.name} je smazaná.`, {
        description: 'Zakázky si svoje etapy nechávají.',
        undo: () =>
          void restoreServiceAction(service.id, res.snapshot).then((r) => {
            if (!r.ok) toast.error(r.error)
            router.refresh()
          }),
      })
    })

  const panelId = `${id}-panel`

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="-m-2 inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-chip p-2 text-left hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown size={18} strokeWidth={1.5} className={cn('shrink-0 text-quiet transition-transform', open && 'rotate-180')} aria-hidden="true" />
          <span className="truncate font-medium text-ink">{service.name}</span>
          <span className="shrink-0 text-sm text-quiet">
            {service.phases.length === 0 ? 'bez etap' : plural(service.phases.length, PHASE_FORMS)}
          </span>
        </button>
        {!service.active && <Badge variant="outline">Nenabízí se</Badge>}
        {dirty && <Badge variant="signal">Neuloženo</Badge>}
      </div>

      {open && (
        <div id={panelId} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink">Název služby</label>
              <input
                id={`${id}-name`}
                value={name}
                maxLength={80}
                onChange={(e) => {
                  setName(e.target.value)
                  setDirty(true)
                }}
                className={inputCls}
              />
            </div>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => {
                  setActive(e.target.checked)
                  setDirty(true)
                }}
                className="h-5 w-5 accent-navy-700"
              />
              Nabízet u nové zakázky
            </label>
          </div>

          <div>
            <h3 className={SECTION_LABEL}>Etapy</h3>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-quiet">Zatím žádné. Přidejte první etapu, třeba „Návrh" nebo „Spuštění".</p>
            ) : (
              <DndContext
                id={`${id}-dnd`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
                accessibility={{
                  screenReaderInstructions: {
                    draggable: 'Etapu zvednete mezerníkem. Šipkami nahoru a dolů ji posunete, mezerníkem pustíte, klávesou Escape přesun zrušíte.',
                  },
                  announcements: {
                    onDragStart: ({ active: a }) => `Zvednuto: ${nameOf(a.id)}.`,
                    onDragOver: ({ active: a, over }) => (over ? `${nameOf(a.id)} je na ${posOf(over.id)}. místě z ${rows.length}.` : `${nameOf(a.id)} je mimo seznam.`),
                    onDragEnd: ({ active: a, over }) => (over ? `Puštěno: ${nameOf(a.id)} na ${posOf(over.id)}. místě.` : `Puštěno: ${nameOf(a.id)}, pořadí se nezměnilo.`),
                    onDragCancel: ({ active: a }) => `Přesun zrušen, ${nameOf(a.id)} zůstává na svém místě.`,
                  },
                }}
              >
                <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                  <ol className="mt-3 space-y-3">
                    {rows.map((r, i) => (
                      <SortablePhase key={r.key} row={r} index={i} disabled={pending || rows.length < 2} onChange={(patch) => update(r.key, patch)} onRemove={() => remove(r.key)} />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={pending || rows.length >= 30}
              onClick={() => edit([...rows, { key: newKey(), name: '', description: '', days: '', tasksText: '' }])}
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              Přidat etapu
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
            <Button type="button" onClick={save} disabled={pending || !dirty}>
              {pending && <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}
              Uložit službu
            </Button>
            <Button type="button" variant="ghost" onClick={destroy} disabled={pending} className="text-danger">
              Smazat službu
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function SortablePhase({
  row,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  row: Row
  index: number
  disabled: boolean
  onChange: (patch: Partial<Row>) => void
  onRemove: () => void
}) {
  const id = useId()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.key, disabled })
  const label = row.name.trim() || `etapa ${index + 1}`
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative rounded-chip border border-navy-100 bg-surface p-4', isDragging && 'z-10 shadow-lg')}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={`Přesunout: ${label}`}
          className="-ml-2 inline-flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-chip text-quiet hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        >
          <GripVertical size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink">Název etapy</label>
            <input id={`${id}-name`} value={row.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-days`} className="text-sm font-medium text-ink">Obvykle dní</label>
            <input
              id={`${id}-days`}
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              value={row.days}
              onChange={(e) => onChange({ days: e.target.value })}
              className={cn(inputCls, 'font-num')}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${id}-desc`} className="text-sm font-medium text-ink">Co se v etapě děje (uvidí klient)</label>
            <textarea id={`${id}-desc`} value={row.description} maxLength={1000} rows={2} onChange={(e) => onChange({ description: e.target.value })} className={cn(inputCls, 'resize-none')} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${id}-tasks`} className="text-sm font-medium text-ink">Úkoly pro klienta, každý na řádek</label>
            <textarea id={`${id}-tasks`} value={row.tasksText} rows={3} onChange={(e) => onChange({ tasksText: e.target.value })} className={cn(inputCls, 'resize-none')} />
            <p className="text-xs text-quiet">Třeba dodat texty, poslat fotky nebo schválit návrh. Hesla a přístupy sem nepatří.</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Odebrat: ${label}`} className="text-quiet">
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}
