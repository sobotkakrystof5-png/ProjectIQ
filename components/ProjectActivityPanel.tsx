'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Pencil, Plus, ShieldAlert, X } from 'lucide-react'
import {
  approveActivity,
  approveAllDrafts,
  createActivityDraft,
  rejectActivity,
  reopenActivity,
  updateActivity,
} from '@/app/project-activity-actions'
import {
  ACTIVITY_BODY_MAX,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  ACTIVITY_TITLE_MAX,
  type ActivityKind,
} from '@/lib/project-activity'
import { cn, formatDate } from '@/lib/utils'

export interface ActivityItem {
  id: string
  status: 'draft' | 'published' | 'rejected'
  source: 'manual' | 'claude_code' | 'system'
  kind: ActivityKind
  title: string
  body: string
  containsSensitive: boolean
  createdAt: string
  publishedAt: string | null
}

const SOURCE_LABELS: Record<ActivityItem['source'], string> = {
  manual: 'Napsáno ručně',
  claude_code: 'Z Claude Code',
  system: 'Automaticky',
}

const fieldClass =
  'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

/** Koncepty ke schválení a publikovaná osa. Klient vidí jen publikované. */
export function ProjectActivityPanel({ projectId, items }: { projectId: string; items: ActivityItem[] }) {
  const drafts = items.filter((i) => i.status === 'draft')
  const published = items.filter((i) => i.status === 'published')
  const approvable = drafts.filter((d) => !d.containsSensitive)
  const [composing, setComposing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function approveAll() {
    startTransition(async () => {
      const res = await approveAllDrafts(projectId)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.skipped > 0
          ? `Schváleno ${res.approved}. ${res.skipped} čeká na úpravu.`
          : `Schváleno ${res.approved}. Klient to vidí v přehledu.`,
      )
    })
  }

  return (
    <div className="space-y-5">
      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Ke schválení ({drafts.length})</p>
            {approvable.length > 1 && (
              <button
                type="button"
                onClick={approveAll}
                disabled={isPending}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
              >
                <Check size={14} strokeWidth={1.5} />
                Schválit vše
              </button>
            )}
          </div>
          <ul className="space-y-3">
            {drafts.map((item) => (
              <DraftCard key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}

      {composing ? (
        <ComposeForm projectId={projectId} onDone={() => setComposing(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          <Plus size={14} strokeWidth={1.5} />
          Napsat zprávu pro klienta
        </button>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Co klient vidí</p>
        {published.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Zatím nic. Zprávu, kterou schválíte, uvidí klient ve svém přehledu.
          </p>
        ) : (
          <ul className="space-y-3">
            {published.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-white p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    {ACTIVITY_KIND_LABELS[item.kind]}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(item.publishedAt ?? item.createdAt)}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DraftCard({ item }: { item: ActivityItem }) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function approve() {
    startTransition(async () => {
      const res = await approveActivity(item.id)
      if (!res.success) toast.error(res.error)
      else toast.success('Schváleno. Klient to vidí v přehledu.')
    })
  }

  function reject() {
    startTransition(async () => {
      const res = await rejectActivity(item.id)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      toast('Zpráva zamítnuta.', {
        duration: 8000,
        action: {
          label: 'Zpět',
          onClick: () => {
            void reopenActivity(item.id).then((undo) => {
              if (!undo.success) toast.error(undo.error)
            })
          },
        },
      })
    })
  }

  if (editing) {
    return (
      <li>
        <ComposeForm item={item} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className={cn('rounded-xl border bg-white p-4', item.containsSensitive ? 'border-amber-300' : 'border-border')}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {ACTIVITY_KIND_LABELS[item.kind]}
        </span>
        <span className="text-xs text-muted-foreground">
          {SOURCE_LABELS[item.source]} · {formatDate(item.createdAt)}
        </span>
      </div>
      <p className="text-sm font-medium text-foreground">{item.title}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{item.body}</p>
      {item.containsSensitive && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ShieldAlert size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          Zpráva obsahovala něco, co vypadá jako tajný údaj nebo soukromá cesta, a bylo to zakryto.
          Upravte ji a značku [skryto] odstraňte, jinak ji nejde schválit.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={isPending || item.containsSensitive}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-40"
        >
          <Check size={14} strokeWidth={1.5} />
          Schválit
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-brand-50 disabled:opacity-50"
        >
          <Pencil size={14} strokeWidth={1.5} />
          Upravit
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <X size={14} strokeWidth={1.5} />
          Zamítnout
        </button>
      </div>
    </li>
  )
}

/** Formulář pro novou zprávu (`projectId`) nebo úpravu konceptu (`item`). */
function ComposeForm({ projectId, item, onDone }: { projectId?: string; item?: ActivityItem; onDone: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [kind, setKind] = useState<ActivityKind>(item?.kind ?? 'done')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const input = { title, body, kind }
      const res = item ? await updateActivity(item.id, input) : await createActivityDraft(projectId ?? '', input)
      if (!res.success) {
        setError(res.error)
        return
      }
      toast.success(item ? 'Uloženo.' : 'Koncept uložen. Klient ho uvidí po schválení.')
      onDone()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-brand-50/40 p-4">
      <div>
        <label htmlFor={`act-kind-${item?.id ?? 'new'}`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Druh
        </label>
        <select
          id={`act-kind-${item?.id ?? 'new'}`}
          value={kind}
          onChange={(e) => setKind(e.target.value as ActivityKind)}
          className={fieldClass}
        >
          {ACTIVITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`act-title-${item?.id ?? 'new'}`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Nadpis
        </label>
        <input
          id={`act-title-${item?.id ?? 'new'}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={ACTIVITY_TITLE_MAX}
          className={fieldClass}
          placeholder="Např. Upravili jsme kontaktní stránku"
        />
      </div>
      <div>
        <label htmlFor={`act-body-${item?.id ?? 'new'}`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Co se stalo a co to pro vás znamená
        </label>
        <textarea
          id={`act-body-${item?.id ?? 'new'}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={ACTIVITY_BODY_MAX}
          rows={4}
          className={fieldClass}
          placeholder="Pište srozumitelně pro klienta, bez technických detailů."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {item ? 'Uložit' : 'Uložit jako koncept'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-brand-50"
        >
          Zrušit
        </button>
      </div>
    </form>
  )
}
