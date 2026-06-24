'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Mail, Search, Send, RefreshCw, Download,
  CheckCircle2, Clock, Users, Loader2, AlertTriangle,
} from 'lucide-react'
import { sendLaunchEmailBlast } from '@/app/hub/byznys/startup/startup-actions'
import type { WaitlistEntry } from '@/lib/types'

interface Props {
  projectId: string
  entries: WaitlistEntry[]
  appUrl: string
  dbUrl: string
}

const LOCALE_LABELS: Record<string, string> = {
  cs: '🇨🇿 CZ',
  sk: '🇸🇰 SK',
  en: '🇬🇧 EN',
  de: '🇩🇪 DE',
}

export function WaitlistSection({ projectId, entries, appUrl, dbUrl }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmLaunch, setConfirmLaunch] = useState(false)

  const total = entries.length
  const notified = entries.filter(e => e.launch_notified).length
  const pending = total - notified

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return entries
    return entries.filter(
      e =>
        e.email.toLowerCase().includes(q) ||
        (e.name ?? '').toLowerCase().includes(q)
    )
  }, [entries, search])

  const handleRefresh = async () => {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 1000)
  }

  const handleLaunch = async () => {
    setSending(true)
    setConfirmLaunch(false)
    const result = await sendLaunchEmailBlast(projectId, { dbUrl, appUrl })
    setSending(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.total === 0) {
      toast.info('Všichni uživatelé již byli notifikováni.')
    } else {
      toast.success(`Odesláno ${result.sent} z ${result.total} emailů${result.failed > 0 ? ` (${result.failed} selhalo)` : ''}.`)
      router.refresh()
    }
  }

  const handleExportCsv = () => {
    const rows = [
      ['Jméno', 'Email', 'Jazyk', 'Datum registrace', 'Notifikován'],
      ...entries.map(e => [
        e.name ?? '',
        e.email,
        e.locale,
        new Date(e.created_at).toLocaleDateString('cs-CZ'),
        e.launch_notified ? 'Ano' : 'Ne',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'waitlist.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<Users size={15} strokeWidth={1.5} className="text-brand-600" />}
          label="Celkem"
          value={total}
          color="bg-brand-50 border-brand-100"
        />
        <StatCard
          icon={<Clock size={15} strokeWidth={1.5} className="text-amber-600" />}
          label="Čeká na email"
          value={pending}
          color="bg-amber-50 border-amber-100"
          highlight={pending > 0}
        />
        <StatCard
          icon={<CheckCircle2 size={15} strokeWidth={1.5} className="text-emerald-600" />}
          label="Notifikováno"
          value={notified}
          color="bg-emerald-50 border-emerald-100"
        />
      </div>

      {/* Launch blast */}
      {pending > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Spustit EstatIQ — odeslat launch emaily
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Odešle email s nabídkou 2 měsíců zdarma na {pending} kontaktů, které ještě nebyly notifikovány.
              </p>
            </div>
            {!confirmLaunch ? (
              <button
                type="button"
                onClick={() => setConfirmLaunch(true)}
                disabled={sending}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Send size={13} strokeWidth={1.5} />
                Odeslat všem
              </button>
            ) : (
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs text-emerald-800 font-medium whitespace-nowrap">
                  Odešle se {pending} emailů. Jsi si jistý?
                </span>
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {sending
                    ? <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
                    : <Send size={11} strokeWidth={1.5} />
                  }
                  {sending ? 'Odesílá se…' : 'Ano, odeslat'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLaunch(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Zrušit
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {pending === 0 && notified > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 size={15} strokeWidth={1.5} />
          Všichni uživatelé waitlistu byli úspěšně notifikováni.
        </div>
      )}

      {/* Table controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Hledat email nebo jméno…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground border border-border rounded-xl hover:bg-muted/40 transition-colors"
          >
            <Download size={12} strokeWidth={1.5} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground border border-border rounded-xl hover:bg-muted/40 transition-colors"
          >
            <RefreshCw size={12} strokeWidth={1.5} className={refreshing ? 'animate-spin' : ''} />
            Obnovit
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-muted-foreground text-sm gap-2">
          <Mail size={24} strokeWidth={1.5} />
          {entries.length === 0 ? 'Zatím nikdo na waitlistu.' : 'Žádný výsledek pro hledaný výraz.'}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Jméno</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Jazyk</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Datum</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {entry.name ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{entry.email}</td>
                  <td className="px-4 py-2.5 text-xs hidden sm:table-cell">
                    {LOCALE_LABELS[entry.locale] ?? entry.locale}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {new Date(entry.created_at).toLocaleDateString('cs-CZ')}
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.launch_notified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={10} strokeWidth={2} />
                        Notifikován
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Clock size={10} strokeWidth={2} />
                        Čeká
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Zobrazeno {filtered.length} z {total} zápisů
        </p>
      )}
    </div>
  )
}

function StatCard({
  icon, label, value, color, highlight,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  highlight?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${color}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${highlight ? 'text-amber-700' : 'text-foreground'}`}>
          {value}
        </p>
      </div>
    </div>
  )
}
