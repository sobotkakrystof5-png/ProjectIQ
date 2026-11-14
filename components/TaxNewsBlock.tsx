'use client'
import { Badge } from '@/components/ui/badge'

import { useState, useTransition } from 'react'
import {
  Newspaper, ExternalLink, Check, CheckCheck, RefreshCw, Loader2, AlertTriangle, Inbox,
} from 'lucide-react'
import { markTaxNewsRead, markAllTaxNewsRead, refreshTaxNews } from '@/app/dashboard/finance/tax-news-actions'
import type { TaxNewsData, TaxNewsItem } from '@/app/dashboard/finance/tax-news-actions'
import { TAX_NEWS_SOURCE_LABELS } from '@/lib/types'

function formatDate(value: string | null) {
  if (!value) return 'datum neuvedeno'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'datum neuvedeno'

  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

function NewsRow({ item, onRead, isPending }: {
  item: TaxNewsItem
  onRead: (id: string) => void
  isPending: boolean
}) {
  return (
    <div className={`flex gap-2.5 py-2.5 px-2.5 rounded-chip group transition-colors ${
      item.read ? 'opacity-60 hover:opacity-100' : 'bg-surface'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${
        item.read ? 'bg-transparent' : 'bg-signal'
      }`} />

      <div className="min-w-0 flex-1">
        {/* Zdroj a datum jsou vždy vidět — je to informace z úřadu,
            ne daňové poradenství, a musí se dát ověřit u originálu. */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <Badge variant="neutral">{TAX_NEWS_SOURCE_LABELS[item.source] ?? item.source}</Badge>
          <span className="text-[11px] text-quiet">{formatDate(item.published_at)}</span>
        </div>

        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link inline-flex items-start gap-1 text-sm font-medium text-ink transition-colors hover:text-navy-700"
        >
          <span className="min-w-0">{item.title}</span>
          <ExternalLink size={11} strokeWidth={1.5} className="shrink-0 mt-1 opacity-40 group-hover/link:opacity-100 transition-opacity" />
        </a>

        {item.summary && (
          <p className="text-xs text-quiet mt-1 leading-relaxed line-clamp-2">{item.summary}</p>
        )}
      </div>

      {!item.read && (
        <button
          type="button"
          onClick={() => onRead(item.id)}
          disabled={isPending}
          title="Označit za přečtené"
          aria-label={`Označit „${item.title}" za přečtené`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-chip text-quiet transition-colors hover:bg-navy-50 hover:text-navy-700 disabled:opacity-50"
        >
          <Check size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

/**
 * Novinky z legislativy — Finanční správa a ČSSZ.
 *
 * Plní je týdenní cron, blok je jen čte. Tlačítko „Načíst teď" existuje
 * kvůli prvnímu spuštění a je bezpečné mačkat opakovaně (zápis je
 * idempotentní přes `(source, guid)`).
 */
export function TaxNewsBlock({ data }: { data: TaxNewsData }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)

  const handleRead = (id: string) => {
    startTransition(async () => { await markTaxNewsRead(id) })
  }

  const handleReadAll = () => {
    startTransition(async () => { await markAllTaxNewsRead() })
  }

  const handleRefresh = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await refreshTaxNews()
      setMessage(
        result.error
          ? { text: result.error, tone: 'error' }
          : {
              text: result.inserted > 0
                ? `Načteno ${result.inserted} ${result.inserted === 1 ? 'nová novinka' : 'nových novinek'}.`
                : 'Žádné nové novinky.',
              tone: 'ok',
            },
      )
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-navy-50 rounded-chip flex items-center justify-center">
            <Newspaper size={15} className="text-navy-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink flex items-center gap-2">
              Novinky z legislativy
              {data.unreadCount > 0 && (
                <span className="rounded-full bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-900">
                  {data.unreadCount} nových
                </span>
              )}
            </h3>
            <p className="text-xs text-quiet">
              Finanční správa a ČSSZ · filtrováno na OSVČ, paušál, daně a pojistné
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {data.unreadCount > 0 && (
            <button
              type="button"
              onClick={handleReadAll}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-chip border border-navy-100 text-quiet hover:text-ink hover:bg-muted transition-colors disabled:opacity-50"
            >
              <CheckCheck size={13} strokeWidth={1.5} />
              Přečteno
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-chip border border-navy-100 text-quiet hover:text-ink hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isPending
              ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
              : <RefreshCw size={13} strokeWidth={1.5} />}
            Načíst teď
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-start gap-2 text-xs rounded-chip px-3 py-2 border ${
          message.tone === 'error'
            ? 'border-dashed border-signal-line bg-signal-bg text-signal-ink'
            : 'border-navy-100 bg-navy-50 text-navy-900'
        }`}>
          {message.tone === 'error' && <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center py-8 px-4 rounded-chip border border-dashed border-navy-100 bg-surface">
          <Inbox size={20} strokeWidth={1.5} className="text-quiet" />
          <p className="text-sm text-quiet">Zatím žádné novinky.</p>
          <p className="text-xs text-quiet max-w-sm leading-relaxed">
            Kanály se stahují jednou týdně. Tlačítkem „Načíst teď" je stáhneš hned.
          </p>
        </div>
      ) : (
        <div className="rounded-chip border border-navy-100 bg-muted/20 divide-y divide-navy-100">
          {data.items.map(item => (
            <NewsRow key={item.id} item={item} onRead={handleRead} isPending={isPending} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-quiet leading-relaxed">
        Přebráno z veřejných RSS kanálů úřadů, bez úprav a bez výkladu. Je to informace,
        ne daňové poradenství — u každé položky je zdroj i datum a odkaz vede na originál.
      </p>
    </div>
  )
}
