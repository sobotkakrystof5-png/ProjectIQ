import Link from 'next/link'
import { Mic } from 'lucide-react'
import { Card, CardHead } from '@/components/admin/card'
import { EmptyState } from '@/components/ws/brand'
import type { MeetingDetail, MeetingListItem } from '@/lib/admin/voice/meetings'
import { formatOffset } from '@/lib/admin/voice/meeting-transcript'
import { formatDateTime } from '@/lib/utils'
import { MeetingActions, MeetingContact, MeetingCopyButton, MeetingSummarizeButton } from './meeting-controls'

/**
 * ZakazIQ Voice — schůzky (R-151): seznam a detail v adminu. Text přepisu
 * a shrnutí se vykresluje jen jako text (React escapuje), nikdy jako HTML.
 */

export const MEETINGS_PATH = '/dashboard/voice?tab=schuzky'

export function durationText(ms: number | null): string {
  if (ms === null) return 'probíhá'
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function VoiceMeetingsList({ meetings, activeId }: { meetings: MeetingListItem[]; activeId: string | null }) {
  if (!meetings.length) {
    return (
      <EmptyState
        title="Zatím žádná schůzka"
        description="Na Macu v liště ZakazIQ Voice zvolte Začít schůzku. Nahraje se váš mikrofon i zvuk hovoru a přepis se objeví tady."
      />
    )
  }
  return (
    <Card className="self-start p-0">
      <ul className="divide-y divide-navy-100">
        {meetings.map((m) => (
          <li key={m.id}>
            <Link
              href={`${MEETINGS_PATH}&schuzka=${m.id}`}
              aria-current={m.id === activeId ? 'page' : undefined}
              className={`flex min-h-14 flex-col gap-0.5 px-4 py-3 hover:bg-navy-50 ${m.id === activeId ? 'bg-navy-50' : ''}`}
            >
              <span className="text-sm font-semibold text-ink">{m.title ?? 'Schůzka bez názvu'}</span>
              <span className="text-xs text-quiet">
                {formatDateTime(m.startedAt)} · {durationText(m.durationMs)}
                {m.contactName ? ` · ${m.contactName}` : ''}
                {m.hasSummary ? ' · shrnuto' : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function VoiceMeetingDetail({ meeting, aiReady }: { meeting: MeetingDetail; aiReady: boolean }) {
  const s = meeting.summary
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">{meeting.title ?? 'Schůzka bez názvu'}</h2>
              <p className="text-sm text-quiet">
                {formatDateTime(meeting.startedAt)} · {durationText(meeting.durationMs)}
                {meeting.appName ? ` · ${meeting.appName}` : ''} · {meeting.words} slov
              </p>
            </div>
            <MeetingActions id={meeting.id} title={meeting.title} />
          </div>
          <MeetingContact id={meeting.id} contactId={meeting.contactId} contactName={meeting.contactName} />
          {meeting.status === 'recording' && (
            <p className="text-sm text-quiet">Schůzka ještě běží, nebo se Mac neozval s koncem. Přepis přibývá průběžně.</p>
          )}
          {meeting.failedTurns > 0 && (
            <p className="text-sm text-quiet">
              {meeting.failedTurns} promluv se zatím nepodařilo přepsat. Mac je zkusí poslat znovu.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Shrnutí" />
        {meeting.blocks.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <MeetingSummarizeButton id={meeting.id} again={s !== null} disabled={!aiReady} />
            {meeting.summaryText && <MeetingCopyButton text={meeting.summaryText} label="Zkopírovat shrnutí" />}
          </div>
        )}
        {s ? (
          <div className="flex flex-col gap-4 text-sm text-ink">
            <p className="whitespace-pre-line">{s.summary}</p>
            <SummaryList title="Na čem jsme se domluvili" items={s.agreements} />
            <SummaryList title="Co udělám já" items={s.mySteps} />
            <SummaryList title="Co udělá klient" items={s.clientSteps} />
            <SummaryList title="Otevřené otázky" items={s.openQuestions} />
            <SummaryList title="Jen pro mě" items={s.internalNotes} />
          </div>
        ) : (
          <p className="text-sm text-quiet">
            {aiReady
              ? 'Shrnutí udělá AI z přepisu: o čem schůzka byla, na čem jste se domluvili a kdo co udělá. Stojí pár korun.'
              : 'AI není nastavená (chybí ANTHROPIC_API_KEY).'}
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="Přepis" />
        {meeting.blocks.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <MeetingCopyButton text={meeting.transcript} label="Zkopírovat přepis" />
          </div>
        )}
        {meeting.blocks.length === 0 ? (
          <p className="text-sm text-quiet">Zatím tu nic není. Přepis se skládá z promluv, které Mac posílá během schůzky.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {meeting.blocks.map((b, i) => (
              <li key={`${b.startMs}-${i}`} className="flex gap-3">
                <span className="w-14 shrink-0 pt-0.5 font-num text-xs text-quiet">{formatOffset(b.startMs)}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${b.speaker === 'me' ? 'text-navy-700' : 'text-ink'}`}>
                    {b.speaker === 'me' ? <Mic size={12} strokeWidth={1.5} aria-hidden="true" className="mr-1 inline" /> : null}
                    {b.label}
                  </p>
                  <p className="whitespace-pre-line text-sm text-ink">{b.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
