'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createCompletedProject,
  deleteCompletedProject,
  updateCompletedProject,
  type CompletedProjectPayload,
} from '@/app/completed-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { getPragueTodayISO } from '@/lib/prague-time'
import type { CompletedProject, ProjectType } from '@/lib/types'

/**
 * Přidání a úprava dokončené zakázky (AD07).
 *
 * Tabulka je od AD07 serverová a řadí se v databázi, takže formulář do řádku
 * nepatří — řádek by se po uložení stejně překreslil ze serveru. Zůstal jeden
 * dialog, který je stejný pro přidání i úpravu a je jediným klientským kusem
 * obrazovky.
 */

const emptyForm = (type: ProjectType): CompletedProjectPayload => ({
  title: '',
  client_name: null,
  company: null,
  completed_at: getPragueTodayISO(),
  amount: 0,
  deposit_amount: null,
  difficulty: 5,
  time_invested: null,
  estimated_hours: null,
  notes: null,
  project_type: type,
})

const toForm = (project: CompletedProject): CompletedProjectPayload => ({
  title: project.title,
  client_name: project.client_name,
  company: project.company,
  completed_at: new Date(project.completed_at).toISOString().slice(0, 10),
  amount: Number(project.amount),
  deposit_amount: project.deposit_amount != null ? Number(project.deposit_amount) : null,
  difficulty: project.difficulty,
  time_invested: project.time_invested != null ? Number(project.time_invested) : null,
  estimated_hours: project.estimated_hours != null ? Number(project.estimated_hours) : null,
  notes: project.notes,
  project_type: project.project_type,
})

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

function CompletedForm({
  initial,
  mode,
  open,
  onOpenChange,
  projectId,
}: {
  initial: CompletedProjectPayload
  mode: 'new' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: string
}) {
  const [form, setForm] = useState(initial)
  const [pending, start] = useTransition()
  const set = <K extends keyof CompletedProjectPayload>(key: K, value: CompletedProjectPayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const num = (value: string): number | null => (value.trim() === '' ? null : Number(value))

  const save = () => {
    if (!form.title.trim()) return
    start(async () => {
      if (mode === 'edit' && projectId) {
        await updateCompletedProject(projectId, form)
        toast.success('Uloženo')
      } else {
        await createCompletedProject(form)
        toast.success('Zakázka přidaná')
      }
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Upravit zakázku' : 'Přidat dokončenou zakázku'}</DialogTitle>
          <DialogDescription>
            Částka se po uložení promítne do příjmů ve Financích.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Název zakázky">
              <Input
                autoFocus
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Web pro kavárnu"
              />
            </Field>
          </div>
          <Field label="Klient">
            <Input value={form.client_name ?? ''} onChange={(e) => set('client_name', e.target.value || null)} />
          </Field>
          <Field label="Firma">
            <Input value={form.company ?? ''} onChange={(e) => set('company', e.target.value || null)} />
          </Field>
          <Field label="Datum dokončení">
            <Input type="date" value={form.completed_at} onChange={(e) => set('completed_at', e.target.value)} />
          </Field>
          <Field label="Částka (Kč)">
            <Input
              type="number"
              min="0"
              className="font-num"
              value={form.amount || ''}
              onChange={(e) => set('amount', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Záloha (Kč)">
            <Input
              type="number"
              min="0"
              className="font-num"
              value={form.deposit_amount ?? ''}
              onChange={(e) => set('deposit_amount', num(e.target.value))}
            />
          </Field>
          <Field label="Náročnost 1–10">
            <Input
              type="number"
              min="1"
              max="10"
              className="font-num"
              value={form.difficulty}
              onChange={(e) => set('difficulty', Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
          <Field label="Strávený čas (hodiny)">
            <Input
              type="number"
              min="0"
              step="0.5"
              className="font-num"
              value={form.time_invested ?? ''}
              onChange={(e) => set('time_invested', num(e.target.value))}
            />
          </Field>
          <Field label="Odhad času (hodiny)">
            <Input
              type="number"
              min="0"
              step="0.5"
              className="font-num"
              value={form.estimated_hours ?? ''}
              onChange={(e) => set('estimated_hours', num(e.target.value))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Poznámka">
              <Input value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={save} disabled={pending || !form.title.trim()}>
            {mode === 'edit' ? 'Uložit' : 'Přidat zakázku'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Hlavní akce obrazovky. */
export function NewCompletedButton({ type }: { type: ProjectType }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={1.5} />
        Přidat zakázku
      </Button>
      {open && (
        <CompletedForm initial={emptyForm(type)} mode="new" open={open} onOpenChange={setOpen} />
      )}
    </>
  )
}

/** Tlačítka v řádku tabulky. */
export function CompletedRowActions({ project }: { project: CompletedProject }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  const remove = () => {
    if (!confirm(`Smazat zakázku „${project.title}“? Smaže se i příjem, který z ní vznikl.`)) return
    start(async () => {
      await deleteCompletedProject(project.id)
      toast.success('Zakázka smazaná')
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Upravit ${project.title}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-quiet transition-colors hover:bg-navy-50 hover:text-navy-700"
      >
        <Pencil size={15} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Smazat ${project.title}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-quiet transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
      >
        <Trash2 size={15} strokeWidth={1.5} />
      </button>
      {open && (
        <CompletedForm
          initial={toForm(project)}
          mode="edit"
          projectId={project.id}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  )
}
