'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { Card, CardHead } from '@/components/admin/card'
import { ResearchView } from '@/components/admin/offers/research-view'
import {
  deleteOfferResearchAction,
  refreshOfferResearchAction,
  setupOfferAgentsAction,
  startOfferResearchAction,
} from '@/app/offer-research-actions'
import type { AgentSetupState, ResearchRow, StartOutcome } from '@/lib/admin/offers/research'

/**
 * Rozbor firmy u kontaktu (navrhovač nabídek, N1, R-147).
 *
 * Jedna hlavní akce: „Připravit rozbor". Pak karta každých 8 s zjišťuje,
 * jestli agenti doběhli; zavřené okno nevadí, výsledek si převezme denní cron.
 * Smazání nemá potvrzovací dialog: rozbor zmizí hned a toast nabídne „Zpět".
 */

const POLL_MS = 8_000
const DELETE_DELAY_MS = 6_000

const START_ERROR: Record<Exclude<StartOutcome, { ok: true }>['error'], string> = {
  no_api_key: 'Chybí klíč k AI. Doplňte ho ve Vercelu a zkuste to znovu.',
  not_set_up: 'Agenti ještě nejsou nastavení. Klikněte na Nastavit agenty.',
  outdated: 'Nastavení agentů se změnilo. Klikněte na Aktualizovat agenty.',
  not_found: 'Kontakt se nepodařilo najít. Obnovte stránku.',
  already_running: 'Rozbor už běží. Počkejte, až doběhne.',
  daily_limit: 'Dnes už proběhlo 15 rozborů. Další půjde spustit zítra.',
  start_failed: 'Rozbor se nepodařilo spustit. Zkuste to za chvíli znovu.',
}

const RUN_ERROR: Record<string, string> = {
  timeout: 'Rozbor trval moc dlouho a ukončil se. Spusťte ho znovu.',
  budget: 'Rozbor narazil na strop ceny 2 USD a zastavil se. Spusťte ho znovu.',
  invalid_result: 'Agenti nevrátili použitelný rozbor. Spusťte ho znovu.',
  no_result: 'Agenti skončili bez rozboru. Spusťte ho znovu.',
  terminated: 'Běh u Anthropicu skončil chybou. Spusťte ho znovu.',
  start_failed: 'Rozbor se nepodařilo spustit. Spusťte ho znovu.',
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

const usd = (cents: number) => `${(cents / 100).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`

function runMeta(row: ResearchRow): string {
  const parts = [dateTime(row.created_at)]
  if (row.active_seconds !== null && row.active_seconds > 0) parts.push(`${Math.max(1, Math.round(row.active_seconds / 60))} min`)
  if (row.cost_cents !== null) parts.push(usd(row.cost_cents))
  return parts.join(' · ')
}

const primaryBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60'
const quietBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50 disabled:opacity-60'

export function ResearchCard({
  contactId,
  initialWeb,
  setup,
  rows: initialRows,
}: {
  contactId: string
  initialWeb: string | null
  setup: AgentSetupState['status']
  rows: ResearchRow[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [web, setWeb] = useState(initialWeb ?? '')
  const [pending, startTransition] = useTransition()
  const hidden = useRef(new Set<string>())

  useEffect(() => setRows(initialRows), [initialRows])

  const latest = rows[0] ?? null
  const running = latest?.status === 'running'
  const runningId = running ? latest.id : null

  // Dokud agenti běží, karta se ptá na stav. Zastaví se sama, jakmile doběhnou.
  // Závisí jen na id: nový objekt řádku po každém dotazu nesmí časovač restartovat.
  useEffect(() => {
    if (runningId === null) return
    let stopped = false
    const tick = async () => {
      const next = await refreshOfferResearchAction(runningId).catch(() => null)
      if (stopped || next === null) return
      setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
      if (next.status === 'done') toast.success('Rozbor je hotový')
      if (next.status === 'failed') toast.error('Rozbor se nepovedl', { description: RUN_ERROR[next.error ?? ''] })
    }
    const timer = setInterval(tick, POLL_MS)
    void tick()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [runningId])

  function setupAgents() {
    startTransition(async () => {
      const res = await setupOfferAgentsAction()
      if (res.ok) {
        toast.success('Agenti jsou nastavení')
        router.refresh()
      } else {
        toast.error(
          res.error === 'no_api_key' ? 'Chybí klíč k AI' : 'Agenty se nepodařilo nastavit',
          { description: res.error === 'no_api_key' ? 'Doplňte ho ve Vercelu.' : 'Zkuste to za chvíli znovu.' },
        )
      }
    })
  }

  function start() {
    startTransition(async () => {
      const res = await startOfferResearchAction(contactId, web.trim() === '' ? null : web.trim())
      if (!res.ok) {
        toast.error('Rozbor se nespustil', { description: START_ERROR[res.error] })
        return
      }
      toast.success('Rozbor běží', { description: 'Trvá pár minut. Stránku můžete zavřít.' })
      router.refresh()
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
      hint="Agenti projdou web firmy, rejstříky, recenze a konkurenci. Podklad pro nabídku, zatím bez ceny."
    />
  )

  if (setup === 'no_api_key') {
    return (
      <Card>
        {head}
        <p className="text-sm text-quiet">Rozbor potřebuje klíč k AI. Doplňte ho ve Vercelu a obnovte stránku.</p>
      </Card>
    )
  }

  if (setup === 'missing' || setup === 'outdated') {
    return (
      <Card>
        {head}
        <p className="mb-4 text-sm leading-6 text-ink">
          {setup === 'missing'
            ? 'Agenti ve vašem účtu u Anthropicu zatím nejsou. Nastavíte je jedním kliknutím, platí se až za rozbory.'
            : 'Nastavení agentů se od posledně změnilo. Aktualizujte je, ať rozbor běží podle nových pokynů.'}
        </p>
        <button type="button" onClick={setupAgents} disabled={pending} className={primaryBtn}>
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {setup === 'missing' ? 'Nastavit agenty' : 'Aktualizovat agenty'}
        </button>
      </Card>
    )
  }

  return (
    <Card>
      {head}

      {!running && (
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
      {!running && <p className="-mt-4 mb-6 text-xs text-quiet">Trvá pár minut a stojí zhruba 10–25 Kč.</p>}

      {latest === null && <p className="text-sm text-quiet">Zatím žádný rozbor. Zkontrolujte web firmy a spusťte ho.</p>}

      {running && latest && (
        <div className="flex items-start gap-3 rounded-chip bg-navy-50 px-4 py-3" role="status">
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-navy-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Agenti procházejí web a veřejné zdroje</p>
            <p className="text-xs text-quiet">Spuštěno {dateTime(latest.created_at)}. Stránku můžete zavřít, rozbor se uloží sám.</p>
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
                  {runMeta(row)} · {row.status === 'done' ? 'hotovo' : row.status === 'failed' ? 'nepovedl se' : 'běží'}
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
