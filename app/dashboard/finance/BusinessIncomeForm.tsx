'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { Card, SECTION_LABEL } from '@/components/admin/card'
import { BASE_CURRENCY, formatMoney } from '@/lib/money-currency'
import { cn, formatDate } from '@/lib/utils'
import type { BusinessPaymentsPanel, ManualPayment } from '@/lib/admin/project-payments'
import { addBusinessIncome, deleteBusinessIncome, type BusinessIncomeInput } from './business-income-actions'

// Zapsat příjem v Podnikání (R-110): záloha k zakázce (i víc záloh na jednu
// zakázku), nebo jednorázový příjem bez zakázky. Smazání se neptá dopředu —
// provede se hned a toast nabídne „Zpět" (AGENTS.md → B9).

type Kind = 'zaloha' | 'jednorazovy'

const SELECT_CLASS =
  'flex h-11 w-full rounded-chip border border-input bg-surface px-3 text-[15px] text-ink focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

const czk = (amount: number) => formatMoney(amount, BASE_CURRENCY)

export function BusinessIncomeForm({ panel, todayIso }: { panel: BusinessPaymentsPanel; todayIso: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<Kind>(panel.projects.length > 0 ? 'zaloha' : 'jednorazovy')
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState('')
  const [declared, setDeclared] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const project = useMemo(() => panel.projects.find((p) => p.id === projectId) ?? null, [panel.projects, projectId])

  const save = (input: BusinessIncomeInput, onDone?: () => void) =>
    start(async () => {
      const result = await addBusinessIncome(input)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      setError(null)
      onDone?.()
      router.refresh()
    })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Zadejte částku větší než nula.')
      return
    }
    if (kind === 'zaloha' && !project) {
      setError('Vyberte zakázku, ke které záloha patří.')
      return
    }
    save(
      {
        kind,
        amount: value,
        date,
        note,
        declared: kind === 'jednorazovy' ? declared : false,
        projectId: kind === 'zaloha' ? projectId : null,
      },
      () => {
        toast.success(
          kind === 'zaloha'
            ? `Záloha ${czk(value)} je u zakázky zapsaná.`
            : `Příjem ${czk(value)} je zapsaný.`,
          kind === 'zaloha' && project
            ? { description: `Zbývá doplatit ${czk(Math.max(0, project.remaining - value))}.` }
            : undefined,
        )
        setAmount('')
        setNote('')
        if (kind === 'zaloha') setProjectId('')
      },
    )
  }

  const remove = (payment: ManualPayment) =>
    start(async () => {
      const result = await deleteBusinessIncome(payment.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
      toast.success(payment.kind === 'zaloha' ? 'Záloha je smazaná.' : 'Příjem je smazaný.', {
        undo: () =>
          save({
            kind: payment.kind,
            amount: payment.amount,
            date: payment.date,
            note: payment.note ?? '',
            declared: payment.declared,
            projectId: payment.projectId,
          }),
      })
    })

  return (
    <Card className="p-5">
      <h3 className={cn(SECTION_LABEL, 'flex items-center gap-2')}>
        <Coins size={16} strokeWidth={1.5} className="text-navy-500" aria-hidden="true" />
        Zapsat příjem
      </h3>
      <p className="mt-1 text-sm text-quiet">
        Záloha se odečte od toho, co ze zakázky zbývá doplatit. K jedné zakázce jich můžete zapsat víc.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* Stejný vzhled jako segmentový PillNav, ale přepíná stav formuláře, ne adresu. */}
        <div role="radiogroup" aria-label="Druh příjmu" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-navy-50 p-1">
          {(
            [
              ['zaloha', 'Záloha k zakázce'],
              ['jednorazovy', 'Jednorázový příjem'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={kind === key}
              onClick={() => {
                setKind(key)
                setError(null)
              }}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                kind === key ? 'bg-navy-700 text-white' : 'text-navy-900 hover:bg-navy-100',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {kind === 'zaloha' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="income-project">Zakázka</Label>
              {panel.projects.length === 0 ? (
                <p className="text-sm text-quiet">Žádná zakázka nečeká na peníze.</p>
              ) : (
                <select
                  id="income-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Vyberte zakázku</option>
                  {panel.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · zbývá {czk(p.remaining)}
                    </option>
                  ))}
                </select>
              )}
              {project && (
                <p className="text-xs text-quiet">
                  Zbývá doplatit <span className="font-num text-ink">{czk(project.remaining)}</span> · půjde do linie{' '}
                  {project.declared ? 'přiznaných' : 'nepřiznaných'} příjmů podle zakázky.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="income-amount">Částka v Kč</Label>
            <Input
              id="income-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={project ? String(project.remaining) : 'např. 5000'}
              className="font-num"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="income-date">Kdy peníze dorazily</Label>
            <Input id="income-date" type="date" value={date} max={todayIso} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="income-note">Poznámka</Label>
            <Input
              id="income-note"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === 'zaloha' ? 'např. druhá splátka' : 'např. konzultace, prodej šablony'}
            />
          </div>

          {kind === 'jednorazovy' && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                checked={declared}
                onChange={(e) => setDeclared(e.target.checked)}
                className="h-5 w-5 accent-navy-700"
              />
              Fakturováno na IČO (jde do přiznání)
            </label>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending || (kind === 'zaloha' && panel.projects.length === 0)}>
          {kind === 'zaloha' ? 'Zapsat zálohu' : 'Zapsat příjem'}
        </Button>
      </form>

      {panel.payments.length > 0 && (
        <div className="mt-6 border-t border-navy-100 pt-4">
          <h4 className="text-sm font-semibold text-ink">Zapsané letos</h4>
          <ul className="mt-2 divide-y divide-navy-100">
            {panel.payments.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">
                    {p.kind === 'zaloha' ? `Záloha · ${p.projectLabel ?? 'zakázka'}` : p.note || 'Jednorázový příjem'}
                  </span>
                  <span className="block truncate text-xs text-quiet">
                    {formatDate(p.date)} · {p.declared ? 'přiznané' : 'nepřiznané'}
                    {p.kind === 'zaloha' && p.note ? ` · ${p.note}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="font-num text-ink">{czk(p.amount)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => remove(p)}
                    aria-label={`Smazat ${p.kind === 'zaloha' ? 'zálohu' : 'příjem'} ${czk(p.amount)}`}
                  >
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
