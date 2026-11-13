'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from '@/components/ui/toast'
import { Eye, EyeOff, Mail, Pencil, Trash2 } from 'lucide-react'
import { NEWS_TAG_LABELS, type NewsTag } from '@/lib/ws/news-format'
import { cn } from '@/lib/utils'
import {
  deleteNewsAction,
  newsRecipientsAction,
  publishNewsAction,
  sendNewsEmailAction,
  unpublishNewsAction,
} from './actions'

export type ListNews = {
  id: string
  title: string
  tag: NewsTag
  publishedAt: string | null
  emailedAt: string | null
  emailRecipients: number | null
}

const BUTTON = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium border border-navy-100 rounded-chip bg-surface hover:bg-muted transition-colors disabled:opacity-60'

const people = (n: number) => (n === 1 ? '1 člověku' : `${n} lidem`)
const accounts = (n: number) => (n === 1 ? '1 účtu' : `${n} účtech`)

function Row({ item }: { item: ListNews }) {
  const [pending, start] = useTransition()
  const [confirm, setConfirm] = useState<{ people: number; accounts: number } | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) toast.error(res.error ?? 'Nepodařilo se to.')
      else toast.success(done)
    })

  const askSend = () =>
    start(async () => {
      const res = await newsRecipientsAction()
      if (!res.ok) return void toast.error(res.error)
      setConfirm(res.data)
    })

  const send = () =>
    start(async () => {
      if (!confirm) return
      const res = await sendNewsEmailAction({ id: item.id, confirmedPeople: confirm.people })
      setConfirm(null)
      if (!res.ok) return void toast.error(res.error)
      toast.success(
        res.data.waiting
          ? `Zařazeno ${people(res.data.recipients)}. E-maily čekají ve frontě, dokud nebude nastavená odesílací adresa (WS_EMAIL_FROM).`
          : `Odesláno ${people(res.data.recipients)}${res.data.delivered < res.data.recipients ? ', zbytek dožene fronta' : ''}.`,
      )
    })

  const status = item.emailedAt
    ? { label: `E-mailem ${item.emailRecipients ?? 0}×`, cls: 'bg-navy-100 text-navy-900 ring-navy-200' }
    : item.publishedAt
      ? { label: 'V aplikaci', cls: 'bg-navy-50 text-quiet ring-navy-100' }
      : { label: 'Koncept', cls: 'bg-muted text-quiet ring-border' }

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{item.title}</p>
          <p className="text-[12px] text-quiet">
            {NEWS_TAG_LABELS[item.tag]}
            {item.publishedAt && ` · zveřejněno ${new Date(item.publishedAt).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' })}`}
          </p>
        </div>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 shrink-0', status.cls)}>{status.label}</span>
      </div>

      {confirm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-chip border border-signal-line bg-signal-bg p-3">
          <p className="text-[13px] text-signal-ink flex-1 min-w-[220px]">
            {confirm.people === 0
              ? 'Teď nemá kdo novinku dostat (žádný majitel s e-mailem a zapnutými novinkami).'
              : `Odešle se ${people(confirm.people)} v ${accounts(confirm.accounts)}. Kdo si novinky vypnul, nedostane nic. Poslat jde jen jednou.`}
          </p>
          {confirm.people > 0 && (
            <button type="button" onClick={send} disabled={pending} className={BUTTON}>
              {pending ? 'Posílám…' : 'Ano, poslat'}
            </button>
          )}
          <button type="button" onClick={() => setConfirm(null)} className="text-[13px] text-quiet hover:underline">
            Zpět
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/novinky?upravit=${item.id}`} className={BUTTON}>
            <Pencil size={13} strokeWidth={1.5} />
            Upravit
          </Link>
          {!item.publishedAt && (
            <button type="button" disabled={pending} onClick={() => run(() => publishNewsAction({ id: item.id }), 'Novinka je v aplikaci klientů.')} className={BUTTON}>
              <Eye size={13} strokeWidth={1.5} />
              Zveřejnit v aplikaci
            </button>
          )}
          {item.publishedAt && !item.emailedAt && (
            <>
              <button type="button" disabled={pending} onClick={askSend} className={BUTTON}>
                <Mail size={13} strokeWidth={1.5} />
                Poslat e-mailem všem
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => unpublishNewsAction({ id: item.id }), 'Novinka je skrytá.')} className={BUTTON}>
                <EyeOff size={13} strokeWidth={1.5} />
                Skrýt
              </button>
            </>
          )}
          {!item.publishedAt && (
            <button type="button" disabled={pending} onClick={() => run(() => deleteNewsAction({ id: item.id }), 'Koncept smazaný.')} className={cn(BUTTON, 'hover:text-danger')}>
              <Trash2 size={13} strokeWidth={1.5} />
              Smazat
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function NewsList({ items }: { items: ListNews[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-quiet bg-surface border border-navy-100 rounded-box px-4 py-6 text-center">Zatím žádná novinka. Napiš první nahoře.</p>
  }
  return (
    <ul className="bg-surface border border-navy-100 rounded-box divide-y divide-navy-100">
      {items.map((n) => (
        <Row key={n.id} item={n} />
      ))}
    </ul>
  )
}
