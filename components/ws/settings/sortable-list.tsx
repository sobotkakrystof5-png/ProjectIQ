'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/ws/utils'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { reorderSettings } from '@/app/w/[business]/nastaveni/actions'

type Kind = 'services' | 'staff' | 'fields' | 'stages'

// Pořadí přetažením (S13): myší, prstem za úchyt a klávesnicí (mezera,
// šipky, mezera). Nové pořadí se uloží hned; když uložení selže, vrátí se.
export function SortableList<T extends { id: string }>({ slug, kind, items, nameOf, disabled, itemClassName, children }: {
  slug: string
  kind: Kind
  items: T[]
  nameOf: (item: T) => string
  disabled?: boolean
  itemClassName?: string
  children: (item: T, handle: ReactNode) => ReactNode
}) {
  const { run, pending } = useWsAction()
  const dndId = useId()
  const key = items.map((x) => x.id).join(',')
  const [order, setOrder] = useState(() => items.map((x) => x.id))
  useEffect(() => setOrder(key ? key.split(',') : []), [key])
  const byId = new Map(items.map((x) => [x.id, x]))
  const sorted = order.map((id) => byId.get(id)).filter((x): x is T => Boolean(x))
  const name = (id: UniqueIdentifier) => { const x = byId.get(String(id)); return x ? nameOf(x) : '' }
  const position = (id: UniqueIdentifier | undefined) => (id === undefined ? 0 : order.indexOf(String(id)) + 1)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const prev = order
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)))
    setOrder(next)
    void run(() => reorderSettings({ slug, kind, ids: next }), () => toast.success('Pořadí je uložené.')).then((saved) => { if (!saved) setOrder(prev) })
  }
  const hidden = disabled || sorted.length < 2

  return <DndContext
    id={dndId}
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={onDragEnd}
    accessibility={{
      screenReaderInstructions: { draggable: 'Položku zvednete mezerníkem. Šipkami nahoru a dolů ji posunete, mezerníkem pustíte, klávesou Escape přesun zrušíte.' },
      announcements: {
        onDragStart: ({ active }) => `Zvednuto: ${name(active.id)}.`,
        onDragOver: ({ active, over }) => (over ? `${name(active.id)} je na ${position(over.id)}. místě z ${order.length}.` : `${name(active.id)} je mimo seznam.`),
        onDragEnd: ({ active, over }) => (over ? `Puštěno: ${name(active.id)} na ${position(over.id)}. místě.` : `Puštěno: ${name(active.id)}, pořadí se nezměnilo.`),
        onDragCancel: ({ active }) => `Přesun zrušen, ${name(active.id)} zůstává na svém místě.`,
      },
    }}
  >
    <SortableContext items={order} strategy={verticalListSortingStrategy}>
      <ul className="flex flex-col gap-2">
        {sorted.map((item) => <SortableItem key={item.id} id={item.id} label={nameOf(item)} hidden={hidden} busy={pending} className={itemClassName}>{(handle) => children(item, handle)}</SortableItem>)}
      </ul>
    </SortableContext>
  </DndContext>
}

/** `hidden` = bez úchytu (jen čtení, jedna položka); `busy` = úchyt je vidět, ale během ukládání nejde chytit. */
function SortableItem({ id, label, hidden, busy, className, children }: { id: string; label: string; hidden: boolean; busy: boolean; className?: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: hidden || busy })
  const handle = hidden ? null : <button
    type="button"
    disabled={busy}
    ref={setActivatorNodeRef}
    {...attributes}
    {...listeners}
    aria-label={`Přesunout: ${label}`}
    className="-ml-2 inline-flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-chip text-quiet hover:bg-navy-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-wait disabled:opacity-50"
  >
    <GripVertical size={18} strokeWidth={1.5} aria-hidden />
  </button>
  return <li
    ref={setNodeRef}
    style={{ transform: CSS.Translate.toString(transform), transition }}
    className={cn('relative', isDragging && 'z-10 rounded-panel shadow-lg', className)}
  >
    {children(handle)}
  </li>
}
