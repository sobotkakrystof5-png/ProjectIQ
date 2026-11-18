'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, ExternalLink, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SECTION_LABEL } from '@/components/admin/card'
import { ContactActions } from '@/components/admin/contact-actions'
import { OutreachLeadActions } from '@/components/admin/outreach-lead-actions'
import type { MeetingReadiness } from '@/components/admin/schedule-meeting-dialog'
import { formatWhen, queueReason, type OutreachQueueRow } from '@/lib/admin/outreach-view'
import { adminDemoHref } from '@/lib/admin/outreach-demo'
import { cn } from '@/lib/utils'

/**
 * Fronta „Komu zavolat" — firmy, které obvolal AI asistent v Growth OS
 * a teď je na tahu Kryštof (R-112). Nahoře ti, kdo odpověděli, chtějí
 * zavolat dnes nebo otevřeli ukázku.
 *
 * `Shrnutí hovoru` je text od modelu o skutečném člověku: vykresluje se jako
 * text (React escapuje sám) a klientovi se neposílá.
 */
export function OutreachQueue({
  rows,
  nowIso,
  meeting,
}: {
  rows: OutreachQueueRow[]
  nowIso: string
  /** Je propojený Google a nastavené odesílání z vizeon.cz? (R-112) */
  meeting: MeetingReadiness
}) {
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null)
  // „Teď" přichází ze serveru, ať server a prohlížeč vykreslí stejné popisky
  // („dnes 14:30", „Chtěl zavolat") a řazení sedí s tím, co spočítal server.
  const now = new Date(nowIso)

  if (rows.length === 0) {
    return (
      <div className="rounded-box border border-navy-100 bg-surface px-5 py-8 text-center">
        <p className="text-sm font-semibold text-ink">Teď nikomu volat nemusíte.</p>
        <p className="mt-1 text-sm text-quiet">
          Jakmile si někdo od asistenta řekne o ukázku nebo o hovor, objeví se tady.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Komu zavolat">
      {rows.map((row) => (
        <OutreachItem
          key={row.id}
          row={row}
          now={now}
          nowIso={nowIso}
          meeting={meeting}
          open={openId === row.id}
          onToggle={() => setOpenId(openId === row.id ? null : row.id)}
        />
      ))}
    </ul>
  )
}

function OutreachItem({
  row,
  now,
  nowIso,
  meeting,
  open,
  onToggle,
}: {
  row: OutreachQueueRow
  now: Date
  nowIso: string
  meeting: MeetingReadiness
  open: boolean
  onToggle: () => void
}) {
  const reason = queueReason(row, now)
  const detailId = `outreach-${row.id}`

  return (
    <li className="overflow-hidden rounded-box border border-navy-100 bg-surface">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={detailId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-navy-50"
        >
          {open ? (
            <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-quiet" />
          ) : (
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-quiet" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{row.company}</span>
            <span className="block truncate text-xs text-quiet">
              {[row.contactName, row.industry, row.city].filter(Boolean).join(' · ') || 'Bez dalších údajů'}
            </span>
          </span>
          <Badge variant={reason.urgent ? 'signal' : 'neutral'} className="hidden shrink-0 sm:inline-flex">
            {reason.label}
          </Badge>
        </button>
        {row.phone && (
          <a
            href={`tel:${row.phone}`}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 border-l border-navy-100 px-4 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50"
            aria-label={`Zavolat ${row.company}`}
          >
            <Phone size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Zavolat</span>
          </a>
        )}
      </div>

      {/* Na telefonu se důvod nevejde vedle jména, je pod ním. */}
      <div className="px-4 pb-3 sm:hidden">
        <Badge variant={reason.urgent ? 'signal' : 'neutral'}>{reason.label}</Badge>
      </div>

      {open && (
        <div id={detailId} className="flex flex-col gap-4 border-t border-navy-100 px-4 py-4">
          <ContactActions phone={row.phone} email={row.email} context={{ projectName: row.company }} />

          {(row.demoUrl || row.website) && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {row.demoUrl && (
                <ExternalA href={adminDemoHref(row.demoUrl)}>
                  Ukázka
                  {row.demoViews > 0 ? ` · otevřel ${row.demoViews}×` : ' · zatím neotevřel'}
                </ExternalA>
              )}
              {row.website && <ExternalA href={row.website}>Jeho současný web</ExternalA>}
            </div>
          )}

          {row.callbackText && (
            <div>
              <h3 className={SECTION_LABEL}>Kdy chce zavolat</h3>
              <p className="mt-1 text-sm text-ink">
                {row.callbackText}
                {row.callbackAt ? ` (${formatWhen(row.callbackAt, now)})` : ''}
              </p>
            </div>
          )}

          {row.callSummary && (
            <div>
              <h3 className={SECTION_LABEL}>Shrnutí hovoru</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{row.callSummary}</p>
              <p className="mt-1 text-xs text-quiet">Shrnul to AI asistent, nemusí být přesné. Klientovi to neposílejte.</p>
            </div>
          )}

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-quiet">
            {row.lastCallAt && <Line label="Poslední hovor" value={formatWhen(row.lastCallAt, now)} />}
            {row.attempts > 0 && <Line label="Pokusů o hovor" value={String(row.attempts)} />}
            {row.demoEmailSentAt && <Line label="E-mail s ukázkou" value={formatWhen(row.demoEmailSentAt, now)} />}
            {row.emailOpenedAt && <Line label="Otevřel e-mail" value={formatWhen(row.emailOpenedAt, now)} />}
            {row.emailRepliedAt && <Line label="Odpověděl" value={formatWhen(row.emailRepliedAt, now)} />}
          </dl>

          <OutreachLeadActions
            row={row}
            nowIso={nowIso}
            meeting={meeting}
            className="flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3"
          />
          <Link
            href={`/dashboard/ai-asistent/kontakt/${row.id}`}
            className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-navy-700 underline-offset-4 hover:underline"
          >
            Celý detail: hovory, ukázka, e-maily
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      )}
    </li>
  )
}

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex min-h-11 items-center gap-1.5 font-medium text-navy-700 underline-offset-4 hover:underline')}
    >
      {children}
      <ExternalLink size={14} strokeWidth={1.5} aria-hidden="true" />
    </a>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-medium">{label}:</dt>
      <dd>{value}</dd>
    </div>
  )
}
