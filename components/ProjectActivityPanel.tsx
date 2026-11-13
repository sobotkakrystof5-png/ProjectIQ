'use client'

import { useState, useTransition } from 'react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

// Pole Dílků: bílá plocha, rádius 12 px, výška 44 px (DESIGN.md → Inputs).
// `textarea` si výšku přebíjí vlastní třídou.
const fieldClass =
  'w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'

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
            <p className="text-sm font-medium text-ink">Ke schválení ({drafts.length})</p>
            {approvable.length > 1 && (
              <Button onClick={approveAll} disabled={isPending}>
                <Check size={16} strokeWidth={1.5} aria-hidden="true" />
                Schválit vše
              </Button>
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
        <Button variant="outline" onClick={() => setComposing(true)}>
          <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
          Napsat zprávu pro klienta
        </Button>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Co klient vidí</p>
        {published.length === 0 ? (
          <p className="text-sm text-quiet">Zatím nic. Zprávu, kterou schválíte, uvidí klient ve svém přehledu.</p>
        ) : (
          <ul className="space-y-3">
            {published.map((item) => (
              <li key={item.id} className="rounded-chip border border-navy-100 bg-surface p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge>{ACTIVITY_KIND_LABELS[item.kind]}</Badge>
                  <span className="font-num text-xs text-quiet">{formatDate(item.publishedAt ?? item.createdAt)}</span>
                </div>
                <p className="text-sm font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{item.body}</p>
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
      toast.message('Zpráva zamítnuta.', {
        duration: 8000,
        undo: () => {
          void reopenActivity(item.id).then((undo) => {
            if (!undo.success) toast.error(undo.error)
          })
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
    <li
      className={cn(
        'rounded-chip border bg-surface p-4',
        // Čárkovaná teplá hrana = „čeká to na vás" (DESIGN.md → Signature blocks).
        item.containsSensitive ? 'border-dashed border-signal-line' : 'border-navy-100',
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge>{ACTIVITY_KIND_LABELS[item.kind]}</Badge>
        <span className="text-xs text-quiet">
          {SOURCE_LABELS[item.source]} · <span className="font-num">{formatDate(item.createdAt)}</span>
        </span>
      </div>
      <p className="text-sm font-medium text-ink">{item.title}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{item.body}</p>
      {item.containsSensitive && (
        <p className="mt-2 flex items-start gap-1.5 rounded-chip bg-signal-bg px-3 py-2 text-xs text-signal-ink">
          <ShieldAlert size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          Zpráva obsahovala něco, co vypadá jako tajný údaj nebo soukromá cesta, a bylo to zakryto.
          Upravte ji a značku [skryto] odstraňte, jinak ji nejde schválit.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={approve} disabled={isPending || item.containsSensitive}>
          <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          Schválit
        </Button>
        <Button variant="outline" onClick={() => setEditing(true)} disabled={isPending}>
          <Pencil size={16} strokeWidth={1.5} aria-hidden="true" />
          Upravit
        </Button>
        <Button variant="ghost" onClick={reject} disabled={isPending} className="text-quiet hover:text-danger">
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
          Zamítnout
        </Button>
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
    <form onSubmit={submit} className="space-y-3 rounded-chip border border-navy-100 bg-navy-50/60 p-4">
      <div>
        <label htmlFor={`act-kind-${item?.id ?? 'new'}`} className="mb-1.5 block text-xs font-medium text-quiet">
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
        <label htmlFor={`act-title-${item?.id ?? 'new'}`} className="mb-1.5 block text-xs font-medium text-quiet">
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
        <label htmlFor={`act-body-${item?.id ?? 'new'}`} className="mb-1.5 block text-xs font-medium text-quiet">
          Co se stalo a co to pro vás znamená
        </label>
        <textarea
          id={`act-body-${item?.id ?? 'new'}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={ACTIVITY_BODY_MAX}
          rows={4}
          className={cn(fieldClass, 'leading-relaxed')}
          placeholder="Pište srozumitelně pro klienta, bez technických detailů."
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {item ? 'Uložit' : 'Uložit jako koncept'}
        </Button>
        <Button variant="ghost" onClick={onDone} className="text-quiet">
          Zrušit
        </Button>
      </div>
    </form>
  )
}
