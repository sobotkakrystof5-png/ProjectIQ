import { requireAdminPage } from '@/lib/auth'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Card } from '@/components/admin/card'
import { Badge } from '@/components/ui/badge'
import { countMeetingsToReview, loadMeetingNotes, type MeetingFilter, type MeetingNoteRow } from '@/lib/admin/meeting-notes/store'
import { formatPragueShortDateTime } from '@/lib/prague-time'
import { cn } from '@/lib/utils'

// Schůzky a přepisy (R-144): každá schůzka z Wispr Flow (nebo vložená ručně)
// s doslovným přepisem, shrnutím od AI a klientem. Hlavní akce obrazovky je
// projít, co čeká na potvrzení klienta.

export const dynamic = 'force-dynamic'

const TABS: { id: MeetingFilter; label: string }[] = [
  { id: 'vse', label: 'Všechny' },
  { id: 'ke-kontrole', label: 'Ke kontrole' },
  { id: 'skryte', label: 'Skryté' },
]

function status(row: MeetingNoteRow): { label: string; variant: 'neutral' | 'confirmed' | 'signal' | 'danger' } {
  if (row.aiStatus === 'pending') return { label: 'Zpracovává se', variant: 'neutral' }
  if (row.aiStatus === 'failed') return { label: 'Shrnutí selhalo', variant: 'danger' }
  if (row.hasDraft) return { label: 'Koncept v Gmailu', variant: 'confirmed' }
  if (row.contactId === null && row.isClient !== false) return { label: 'Potvrďte klienta', variant: 'signal' }
  if (row.isClient === false && row.contactId === null) return { label: 'Netýká se klienta', variant: 'neutral' }
  return { label: 'Hotovo', variant: 'neutral' }
}

function MeetingRow({ row }: { row: MeetingNoteRow }) {
  const s = status(row)
  const who = row.contactName ?? (row.suggestedName ? `asi ${row.suggestedName}` : null)
  return (
    <li>
      <Link
        href={`/dashboard/schuzky/${row.id}`}
        className="flex min-h-11 flex-col gap-1.5 rounded-chip px-3 py-3 transition-colors hover:bg-navy-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-ink">{row.title}</span>
          <span className="text-sm text-quiet">
            {[row.startedAt ? formatPragueShortDateTime(row.startedAt) : null, row.minutes ? `${row.minutes} min` : null, who]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <Badge variant={s.variant} className="w-fit">
          {s.label}
        </Badge>
      </Link>
    </li>
  )
}

export default async function SchuzkyPage(props: { searchParams: Promise<{ filtr?: string }> }) {
  await requireAdminPage()
  const { filtr } = await props.searchParams
  const filter: MeetingFilter = TABS.some((t) => t.id === filtr) ? (filtr as MeetingFilter) : 'vse'

  let rows: MeetingNoteRow[] = []
  let toReview = 0
  let missingTable = false
  try {
    ;[rows, toReview] = await Promise.all([loadMeetingNotes(filter), countMeetingsToReview()])
  } catch (err) {
    if ((err as { code?: string })?.code !== '42P01') throw err
    missingTable = true
  }

  return (
    <PageShell width="default">
      <PageHeader
        title="Schůzky"
        subtitle={
          toReview > 0
            ? `${toReview} ${toReview === 1 ? 'schůzka čeká' : toReview < 5 ? 'schůzky čekají' : 'schůzek čeká'}, až potvrdíte klienta`
            : 'Přepisy z Wispr Flow, shrnutí a koncept e-mailu klientovi'
        }
        subtitleFont="sans"
        action={
          <Link
            href="/dashboard/schuzky/nova"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-200 px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
            Vložit přepis
          </Link>
        }
      />

      <nav aria-label="Výběr schůzek" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-navy-100">
          {TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={t.id === 'vse' ? '/dashboard/schuzky' : `/dashboard/schuzky?filtr=${t.id}`}
                aria-current={filter === t.id ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-4 text-sm font-medium transition-colors',
                  filter === t.id ? 'border-navy-700 text-navy-700' : 'border-transparent text-quiet hover:text-ink',
                )}
              >
                {t.label}
                {t.id === 'ke-kontrole' && toReview > 0 && (
                  <span className="rounded-full bg-signal px-1.5 text-[11px] font-semibold leading-5 text-signal-ink">{toReview}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {missingTable ? (
        <Card>
          <p className="text-sm text-quiet">Schůzky budou fungovat po spuštění migrace 134 v databázi.</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="flex flex-col gap-2">
            <p className="font-medium text-ink">
              {filter === 'ke-kontrole' ? 'Nic nečeká na kontrolu.' : filter === 'skryte' ? 'Žádné skryté schůzky.' : 'Zatím tu není žádná schůzka.'}
            </p>
            {filter === 'vse' && (
              <p className="text-sm text-quiet">
                Schůzky nahrané ve Wispr Flow sem chodí samy každou hodinu, když je Mac zapnutý. Přepis můžete vložit i ručně přes
                „Vložit přepis".
              </p>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-2 sm:p-3">
          <ul className="flex flex-col divide-y divide-navy-100">
            {rows.map((row) => (
              <MeetingRow key={row.id} row={row} />
            ))}
          </ul>
        </Card>
      )}
    </PageShell>
  )
}
