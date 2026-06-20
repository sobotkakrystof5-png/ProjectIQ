'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createProject, updateProject } from '@/app/actions'
import { STATUS_LABELS, STATUS_ORDER, type Project, type ProjectStatus, type ProjectType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ChevronDown, Loader2 } from 'lucide-react'

type FormData = {
  client_name: string
  client_email: string
  client_phone: string
  service_type: string
  description: string
  project_url: string
  focus: string
  status: ProjectStatus
  progress: number
  price: string
  paid: boolean
  estimated_costs: string
  deposit_amount: string
  deposit_paid: boolean
  deadline: string
  notes: string
  progressNote: string
  addToCompleted: boolean
  completedType: ProjectType
  completedAt: string
  completedDifficulty: number
  completedTimeInvested: string
}

interface ProjectFormProps {
  project?: Project
}

const defaultData: FormData = {
  client_name: '',
  client_email: '',
  client_phone: '',
  service_type: '',
  description: '',
  project_url: '',
  focus: '',
  status: 'new',
  progress: 0,
  price: '',
  paid: false,
  estimated_costs: '',
  deposit_amount: '',
  deposit_paid: false,
  deadline: '',
  notes: '',
  progressNote: '',
  addToCompleted: false,
  completedType: 'client',
  completedAt: new Date().toISOString().slice(0, 10),
  completedDifficulty: 5,
  completedTimeInvested: '',
}

function projectToForm(p: Project): FormData {
  return {
    client_name: p.client_name,
    client_email: p.client_email ?? '',
    client_phone: p.client_phone ?? '',
    service_type: p.service_type ?? '',
    description: p.description ?? '',
    project_url: p.project_url ?? '',
    focus: p.focus ?? '',
    status: p.status,
    progress: p.progress,
    price: p.price !== null ? String(p.price) : '',
    paid: p.paid,
    estimated_costs: p.estimated_costs !== null ? String(p.estimated_costs) : '',
    deposit_amount: p.deposit_amount !== null ? String(p.deposit_amount) : '',
    deposit_paid: p.deposit_paid,
    deadline: p.deadline ?? '',
    notes: p.notes ?? '',
    progressNote: '',
    addToCompleted: false,
    completedType: 'client',
    completedAt: new Date().toISOString().slice(0, 10),
    completedDifficulty: 5,
    completedTimeInvested: '',
  }
}

export function ProjectForm({ project }: ProjectFormProps) {
  const [form, setForm] = useState<FormData>(project ? projectToForm(project) : defaultData)
  const [depositManuallySet, setDepositManuallySet] = useState(
    project ? project.deposit_amount !== null : false
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const originalProgress = project?.progress ?? 0
  const progressChanged = project != null && form.progress !== originalProgress

  useEffect(() => {
    if (depositManuallySet) return
    const price = Number(form.price)
    if (form.price !== '' && price > 0) {
      setForm(prev => ({ ...prev, deposit_amount: String(Math.round(price * 0.3)) }))
    } else {
      setForm(prev => ({ ...prev, deposit_amount: '' }))
    }
  }, [form.price, depositManuallySet])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleDepositChange(value: string) {
    setDepositManuallySet(true)
    setForm(prev => ({ ...prev, deposit_amount: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.client_name.trim()) {
      setError('Zadej název klienta')
      return
    }

    if (progressChanged && !form.progressNote.trim()) {
      setError('Posunutí postupu vyžaduje popis — co jsi udělal?')
      return
    }

    const payload = {
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim() || null,
      client_phone: form.client_phone.trim() || null,
      service_type: form.service_type.trim() || null,
      description: form.description.trim() || null,
      project_url: form.project_url.trim() || null,
      focus: form.focus.trim() || null,
      status: form.status,
      progress: form.progress,
      price: form.price !== '' ? Number(form.price) : null,
      paid: form.paid,
      estimated_costs: form.estimated_costs !== '' ? Number(form.estimated_costs) : null,
      deposit_amount: form.deposit_amount !== '' ? Number(form.deposit_amount) : null,
      deposit_paid: form.deposit_paid,
      deadline: form.deadline || null,
      notes: form.notes.trim() || null,
    }

    const completedExtra = !project && form.addToCompleted ? {
      project_type: form.completedType,
      completed_at: form.completedAt,
      difficulty: form.completedDifficulty,
      time_invested: form.completedTimeInvested ? Number(form.completedTimeInvested) : null,
    } : undefined

    startTransition(async () => {
      try {
        if (project) {
          await updateProject(
            project.id,
            payload,
            progressChanged
              ? { from: originalProgress, description: form.progressNote.trim() }
              : undefined
          )
          router.refresh()
        } else {
          await createProject(payload, completedExtra)
        }
      } catch {
        setError('Chyba při ukládání zakázky')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Klient *" className="sm:col-span-2">
          <input
            type="text"
            value={form.client_name}
            onChange={e => set('client_name', e.target.value)}
            placeholder="Jméno klienta nebo firma"
            className={inputCls}
            required
          />
        </Field>

        <Field label="E-mail klienta (pro automatické potvrzení)" className="sm:col-span-2">
          <input
            type="email"
            value={form.client_email}
            onChange={e => set('client_email', e.target.value)}
            placeholder="klient@email.cz"
            className={inputCls}
          />
        </Field>

        <Field label="Telefonní číslo">
          <input
            type="tel"
            value={form.client_phone}
            onChange={e => set('client_phone', e.target.value)}
            placeholder="+420 601 234 567"
            className={inputCls}
          />
        </Field>

        <Field label="Typ služby">
          <input
            type="text"
            value={form.service_type}
            onChange={e => set('service_type', e.target.value)}
            placeholder="např. Web na míru, E-shop, Logo…"
            className={inputCls}
          />
        </Field>

        <Field label="Popis zakázky" className="sm:col-span-2">
          <input
            type="text"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Krátký popis co děláme"
            className={inputCls}
          />
        </Field>

        <Field label="URL projektu (živá verze na Vercel)" className="sm:col-span-2">
          <input
            type="url"
            value={form.project_url}
            onChange={e => set('project_url', e.target.value)}
            placeholder="https://muj-projekt.vercel.app"
            className={inputCls}
          />
        </Field>

        <Field label="Zaměření" className="sm:col-span-2">
          <textarea
            value={form.focus}
            onChange={e => set('focus', e.target.value)}
            placeholder="Co je cílem zakázky..."
            rows={3}
            className={cn(inputCls, 'resize-none')}
          />
        </Field>

        <Field label="Stav">
          <select
            value={form.status}
            onChange={e => set('status', e.target.value as ProjectStatus)}
            className={inputCls}
          >
            {STATUS_ORDER.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>

        <Field label={`Postup — ${form.progress}%`} className={progressChanged ? 'sm:col-span-2' : undefined}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={e => {
                set('progress', Number(e.target.value))
                if (Number(e.target.value) === originalProgress) set('progressNote', '')
              }}
              className="flex-1 accent-brand-800"
            />
          </div>
          {progressChanged && (
            <div className="mt-3">
              <label className="text-xs font-medium text-amber-700 uppercase tracking-wide block mb-1.5">
                Co jsi udělal? ({originalProgress}% → {form.progress}%) *
              </label>
              <textarea
                value={form.progressNote}
                onChange={e => set('progressNote', e.target.value)}
                placeholder="Popiš co jsi udělal, v jaké fázi projekt je..."
                rows={3}
                className={cn(inputCls, 'resize-none border-amber-300 focus:ring-amber-500')}
              />
            </div>
          )}
        </Field>

        <Field label="Cena (Kč)">
          <input
            type="number"
            value={form.price}
            onChange={e => set('price', e.target.value)}
            placeholder="0"
            min={0}
            className={inputCls}
          />
        </Field>

        <Field label="Termín">
          <input
            type="date"
            value={form.deadline}
            onChange={e => set('deadline', e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Poznámky (interní)" className="sm:col-span-2">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Interní poznámky — klient neuvidí..."
            rows={3}
            className={cn(inputCls, 'resize-none')}
          />
        </Field>

        <div className="sm:col-span-2 flex items-center gap-3">
          <input
            type="checkbox"
            id="paid"
            checked={form.paid}
            onChange={e => set('paid', e.target.checked)}
            className="w-4 h-4 accent-brand-800"
          />
          <label htmlFor="paid" className="text-sm text-foreground cursor-pointer">
            Zakázka zaplacena
          </label>
        </div>

        {!project && (
          <div className="sm:col-span-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="addToCompleted"
                checked={form.addToCompleted}
                onChange={e => set('addToCompleted', e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <label htmlFor="addToCompleted" className="text-sm text-foreground cursor-pointer">
                Ihned přidat do dokončených projektů
              </label>
            </div>

            {form.addToCompleted && (
              <div className="mt-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-4">
                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Detail dokončeného projektu</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Typ projektu">
                    <div className="relative">
                      <select
                        value={form.completedType}
                        onChange={e => set('completedType', e.target.value as ProjectType)}
                        className={cn(inputCls, 'appearance-none pr-8')}
                      >
                        <option value="client">Zakázka pro klienta</option>
                        <option value="personal">Osobní projekt</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </Field>

                  <Field label="Datum dokončení">
                    <input
                      type="date"
                      value={form.completedAt}
                      onChange={e => set('completedAt', e.target.value)}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Náročnost (1–10)">
                    <div className="relative">
                      <select
                        value={form.completedDifficulty}
                        onChange={e => set('completedDifficulty', Number(e.target.value))}
                        className={cn(inputCls, 'appearance-none pr-8')}
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </Field>

                  <Field label="Čas strávený (hod., volitelné)">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.completedTimeInvested}
                      onChange={e => set('completedTimeInvested', e.target.value)}
                      placeholder="např. 12"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 brand-gradient text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
          {project ? 'Uložit změny' : 'Přidat zakázku'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-muted-foreground px-5 py-2.5 rounded-lg hover:bg-muted transition-colors"
        >
          Zrušit
        </button>
      </div>
    </form>
  )
}

const inputCls =
  'w-full border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-transparent transition-shadow bg-white'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
