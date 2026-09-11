'use client'

import { useState, useTransition } from 'react'
import {
  Newspaper, ExternalLink, Check, CheckCheck, RefreshCw, Loader2, AlertTriangle, Inbox,
} from 'lucide-react'
import { markTaxNewsRead, markAllTaxNewsRead, refreshTaxNews } from '@/app/hub/finance/tax-news-actions'
import type { TaxNewsData, TaxNewsItem } from '@/app/hub/finance/tax-news-actions'
import { TAX_NEWS_SOURCE_LABELS } from '@/lib/types'

function formatDate(value: string | null) {
  if (!value) return 'datum neuvedeno'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'datum neuvedeno'

  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

const SOURCE_STYLES: Record<string, string> = {
  financni_sprava: 'bg-blue-50 text-blue-700 ring-blue-200',
  cssz: 'bg-violet-50 text-violet-700 ring-violet-200',
}

function NewsRow({ item, onRead, isPending }: {
  item: TaxNewsItem
  onRead: (id: string) => void
  isPending: boolean
}) {
  return (
    <div className={`flex gap-2.5 py-2.5 px-2.5 rounded-lg group transition-colors ${
      item.read ? 'opacity-60 hover:opacity-100' : 'bg-white'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${
        item.read ? 'bg-transparent' : 'bg-emerald-500'
      }`} />

      <div className="min-w-0 flex-1">
        {/* Zdroj a datum jsou vždy vidět — je to informace z úřadu,
            ne daňové poradenství, a musí se dát ověřit u originálu. */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1 ${
            SOURCE_STYLES[item.source] ?? 'bg-muted text-muted-foreground ring-border'
          }`}>
            {TAX_NEWS_SOURCE_LABELS[item.source] ?? item.source}
          </span>
          <span className="text-[11px] text-muted-foreground">{formatDate(item.published_at)}</span>
        </div>

        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground hover:text-emerald-700 transition-colors inline-flex items-start gap-1 group/link"
        >
          <span className="min-w-0">{item.title}</span>
          <ExternalLink size={11} strokeWidth={1.5} className="shrink-0 mt-1 opacity-40 group-hover/link:opacity-100 transition-opacity" />
        </a>

        {item.summary && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{item.summary}</p>
        )}
      </div>

      {!item.read && (
        <button
          type="button"
          onClick={() => onRead(item.id)}
          disabled={isPending}
          title="Označit za přečtené"
          aria-label={`Označit „${item.title}" za přečtené`}
          className="shrink-0 self-start p-1.5 rounded-lg text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
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
          <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center">
            <Newspaper size={15} className="text-brand-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              Novinky z legislativy
              {data.unreadCount > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                  {data.unreadCount} nových
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <CheckCheck size={13} strokeWidth={1.5} />
              Přečteno
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isPending
              ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
              : <RefreshCw size={13} strokeWidth={1.5} />}
            Načíst teď
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
          message.tone === 'error'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {message.tone === 'error' && <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center py-8 px-4 rounded-xl border border-dashed border-border bg-white">
          <Inbox size={20} strokeWidth={1.5} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Zatím žádné novinky.</p>
          <p className="text-xs text-muted-foreground/80 max-w-sm leading-relaxed">
            Kanály se stahují jednou týdně. Tlačítkem „Načíst teď" je stáhneš hned.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border">
          {data.items.map(item => (
            <NewsRow key={item.id} item={item} onRead={handleRead} isPending={isPending} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Přebráno z veřejných RSS kanálů úřadů, bez úprav a bez výkladu. Je to informace,
        ne daňové poradenství — u každé položky je zdroj i datum a odkaz vede na originál.
      </p>
    </div>
  )
}
