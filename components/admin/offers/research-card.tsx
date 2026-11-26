'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2, RotateCw, Search, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { ResearchView } from '@/components/admin/offers/research-view'
import {
  deleteOfferResearchAction,
  refreshOfferResearchAction,
  retryOfferResearchAction,
  startOfferResearchAction,
} from '@/app/offer-research-actions'
import type { ResearchRow, ResearchSetup, StartOutcome } from '@/lib/admin/offers/research'

/**
 * Rozbor firmy u kontaktu (navrhovač nabídek, N1, R-147, R-149).
 *
 * Jedna hlavní akce: „Připravit rozbor". Rozbor běží v Claude Code na
 * předplatném; karta se jen každých 15 s dívá do databáze, jestli je hotový.
 * Zavřené okno nevadí, hotový rozbor se ohlásí ve zvonku.
 * Smazání nemá potvrzovací dialog: rozbor zmizí hned a toast nabídne „Zpět".
 */

const POLL_MS = 15_000
const DELETE_DELAY_MS = 6_000

const START_ERROR: Record<Exclude<StartOutcome, { ok: true }>['error'], string> = {
  not_connected: 'Chybí propojení s Claude Code. Nastavte ho podle postupu v dokumentaci adminu.',
  not_found: 'Kontakt se nepodařilo najít. Obnovte stránku.',
  already_running: 'Rozbor už čeká nebo běží. Počkejte, až doběhne.',
  daily_limit: 'Dnes už proběhlo 15 rozborů. Další půjde spustit zítra.',
}

const RUN_ERROR: Record<string, string> = {
  timeout: 'Rozbor se do hodiny nedokončil. Spusťte ho znovu.',
  not_started: 'Rozbor si nikdo nevyzvedl. Zkontrolujte, že úloha v Claude Code je zapnutá, a spusťte ho znovu.',
  gave_up: 'Úloha rozbor nedokončila. Spusťte ho znovu.',
}

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(new Date(iso))

function runMeta(row: ResearchRow): string {
  const parts = [dateTime(row.created_at)]
  if (row.active_seconds !== null && row.active_seconds > 0) parts.push(`${Math.max(1, Math.round(row.active_seconds / 60))} min`)
  return parts.join(' · ')
}

const STATUS_LABEL: Record<ResearchRow['status'], string> = {
  queued: 'čeká',
  running: 'běží',
  done: 'hotovo',
  failed: 'nepovedl se',
}

const primaryBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60'
const quietBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50 disabled:opacity-60'

function SessionLink({ url }: { url: string | null }) {
  if (url === null) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-navy-700 underline underline-offset-2"
    >
      Sledovat v Claude
      <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
    </a>
  )
}

export function ResearchCard({
  contactId,
  initialWeb,
  setup,
  rows: initialRows,
}: {
  contactId: string
  initialWeb: string | null
  setup: ResearchSetup
  rows: ResearchRow[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [web, setWeb] = useState(initialWeb ?? '')
  const [pending, startTransition] = useTransition()
  const hidden = useRef(new Set<string>())

  useEffect(() => setRows(initialRows), [initialRows])

  const latest = rows[0] ?? null
  const open = latest?.status === 'queued' || latest?.status === 'running'
  const openId = open ? latest.id : null

  // Dokud rozbor čeká nebo běží, karta se dívá do databáze. Zastaví se sama.
  // Závisí jen na id: nový objekt řádku po každém dotazu nesmí časovač restartovat.
  useEffect(() => {
    if (openId === null) return
    let stopped = false
    const tick = async () => {
      const next = await refreshOfferResearchAction(openId).catch(() => null)
      if (stopped || next === null) return
      setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
      if (next.status === 'done') toast.success('Rozbor je hotový')
      if (next.status === 'failed') toast.error('Rozbor se nepovedl', { description: RUN_ERROR[next.error ?? ''] })
    }
    const timer = setInterval(tick, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [openId])

  function start() {
    startTransition(async () => {
      const res = await startOfferResearchAction(contactId, web.trim() === '' ? null : web.trim())
      if (!res.ok) {
        toast.error('Rozbor se nespustil', { description: START_ERROR[res.error] })
        return
      }
      if (res.fired) toast.success('Rozbor běží v Claude Code', { description: 'Obvykle do 20 minut. Stránku můžete zavřít.' })
      else toast.message('Rozbor čeká ve frontě', { description: 'Zpracuje se ráno v 7:00.' })
      router.refresh()
    })
  }

  function retry(row: ResearchRow) {
    startTransition(async () => {
      const next = await retryOfferResearchAction(row.id)
      if (next === null) return
      setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
      if (next.status === 'queued' && next.error !== null) toast.error('Spustit hned se znovu nepodařilo', { description: 'Rozbor proběhne ráno v 7:00.' })
      else toast.success('Rozbor běží v Claude Code')
    })
  }

  function remove(row: ResearchRow) {
    hidden.current.add(row.id)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    const timer = setTimeout(() => {
      if (!hidden.current.has(row.id)) return
      void deleteOfferResearchAction(row.id, contactId)
    }, DELETE_DELAY_MS)
    toast.message('Rozbor smazaný', {
      duration: DELETE_DELAY_MS,
      undo: () => {
        clearTimeout(timer)
        hidden.current.delete(row.id)
        setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      },
    })
  }

  const head = (
    <CardHead
      title="Rozbor firmy"
      hint="Subagenti v Claude Code projdou web firmy, rejstříky, recenze a konkurenci. Podklad pro nabídku, zatím bez ceny."
    />
  )

  if (setup === 'not_connected') {
    return (
      <Card>
        {head}
        <p className="text-sm leading-6 text-quiet">
          Rozbor zatím nejde spustit: chybí propojení s Claude Code. Nastavíte ho podle postupu v dokumentaci adminu
          (Navrhovač nabídek).
        </p>
      </Card>
    )
  }

  const fireFailed = latest?.status === 'queued' && (latest.error === 'fire_failed' || latest.error === 'fire_rate_limited')

  return (
    <Card>
      {head}

      {!open && (
        <form
          className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            start()
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Web firmy</span>
            <input
              type="url"
              inputMode="url"
              value={web}
              onChange={(e) => setWeb(e.target.value)}
              placeholder="https://firma.cz (nechte prázdné, když web nemá)"
              maxLength={300}
              className="min-h-11 rounded-chip border border-navy-200 bg-surface px-3 text-sm text-ink placeholder:text-quiet focus:border-navy-700 focus:outline-none"
            />
          </label>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Search size={16} strokeWidth={1.75} aria-hidden />}
            {latest ? 'Připravit znovu' : 'Připravit rozbor'}
          </button>
        </form>
      )}
      {!open && (
        <p className="-mt-4 mb-6 text-xs text-quiet">
          {setup === 'ready'
            ? 'Běží v Claude Code na vašem předplatném, obvykle do 20 minut.'
            : 'Rozbor se zařadí do fronty a zpracuje se ráno v 7:00.'}
        </p>
      )}

      {latest === null && <p className="text-sm text-quiet">Zatím žádný rozbor. Zkontrolujte web firmy a spusťte ho.</p>}

      {open && latest && (
        <div className="flex flex-col gap-3 rounded-chip bg-navy-50 px-4 py-3" role="status">
          <div className="flex items-start gap-3">
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-navy-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {latest.status === 'running' ? 'Subagenti procházejí web a veřejné zdroje' : 'Rozbor čeká na spuštění v Claude Code'}
              </p>
              <p className="text-xs text-quiet">
                {fireFailed
                  ? 'Spustit hned se nepodařilo. Zkuste to znovu, jinak rozbor proběhne ráno v 7:00.'
                  : latest.status === 'queued' && setup === 'queue_only'
                    ? `Zařazeno ${dateTime(latest.created_at)}. Zpracuje se ráno v 7:00.`
                    : `Spuštěno ${dateTime(latest.created_at)}. Stránku můžete zavřít, hotový rozbor se ozve ve zvonku.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pl-[30px]">
            {fireFailed && setup === 'ready' && (
              <button type="button" onClick={() => retry(latest)} disabled={pending} className={quietBtn}>
                <RotateCw size={15} strokeWidth={1.75} aria-hidden />
                Zkusit spustit znovu
              </button>
            )}
            <SessionLink url={latest.session_url} />
          </div>
        </div>
      )}

      {latest?.status === 'failed' && (
        <p className="rounded-chip border border-danger/30 px-4 py-3 text-sm text-ink">
          {RUN_ERROR[latest.error ?? ''] ?? 'Rozbor se nepovedl. Spusťte ho znovu.'}
        </p>
      )}

      {latest?.status === 'done' && latest.result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-num text-xs text-quiet">{runMeta(latest)}</p>
            <button type="button" onClick={() => remove(latest)} className={quietBtn}>
              <Trash2 size={15} strokeWidth={1.75} aria-hidden />
              Smazat
            </button>
          </div>
          <ResearchView result={latest.result} anchor={`zdroj-${latest.id.slice(0, 8)}`} />
        </div>
      )}

      {rows.length > 1 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-quiet">Starší rozbory ({rows.length - 1})</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {rows.slice(1).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-2">
                <span className="font-num text-xs text-quiet">
                  {runMeta(row)} · {STATUS_LABEL[row.status]}
                </span>
                <button type="button" onClick={() => remove(row)} className={quietBtn}>
                  Smazat
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
