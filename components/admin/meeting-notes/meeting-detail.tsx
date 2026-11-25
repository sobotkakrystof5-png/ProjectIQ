import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/ws/app/page-header'
import { Card, CardHead } from '@/components/admin/card'
import { ClientPanel, CopyTextButton, EmailPanel, NoteActions } from '@/components/admin/meeting-notes/note-controls'
import { TranscriptView } from '@/components/admin/meeting-notes/transcript-view'
import type { MeetingNoteDetail } from '@/lib/admin/meeting-notes/store'
import { composeMeetingEmail, hasEmailContent } from '@/lib/admin/meeting-notes/email'
import { plannedFill } from '@/lib/admin/meeting-notes/process'
import { formatPragueDateTime } from '@/lib/prague-time'
import { cn } from '@/lib/utils'

/**
 * Detail schůzky (R-144): Shrnutí (klient, dohody, kroky, koncept e-mailu)
 * a Přepis (doslovně). Hlavní akce: potvrdit klienta, tím vznikne koncept
 * v Gmailu. Data načítá stránka; tady se jen kreslí.
 */

/** „2. 11. v 14:01" — bez zkratky dne, která se v „založen po 2. 11." čte jako „po". */
function stamp(iso: string): string {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: 'numeric', minute: '2-digit' }).format(d)
  return `${day} v ${time}`
}

function Points({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-ink marker:text-quiet">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function MeetingDetailView({
  note,
  tab,
  draftsUrl,
}: {
  note: MeetingNoteDetail
  tab: 'shrnuti' | 'prepis'
  draftsUrl: string
}) {
  const base = `/dashboard/schuzky/${note.id}`
  const ai = note.ai

  const preview = ai && hasEmailContent(ai) ? composeMeetingEmail(ai, note.startedAt) : null
  const emptyReason =
    ai === null
      ? 'Shrnutí ještě není hotové.'
      : preview === null
        ? 'Ze schůzky nevyplynula žádná dohoda ani další krok, e-mail se nepřipravuje.'
        : note.contact !== null && !note.contact.email
          ? 'Klient nemá e-mail. Doplňte ho v kontaktu a založte koncept.'
          : null

  const suggestedName = ai ? [ai.client.name, ai.client.company].filter(Boolean).join(', ') || null : null
  const incomplete = note.declaredChars !== null && Math.abs(note.transcript.length - note.declaredChars) > 50

  const subtitle = [
    note.startedAt ? formatPragueDateTime(note.startedAt) : null,
    note.minutes ? `${note.minutes} min` : null,
    note.source === 'wispr' ? 'z Wispr Flow' : 'vloženo ručně',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageShell width="default">
      <Link
        href="/dashboard/schuzky"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-quiet transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
        Schůzky
      </Link>

      <PageHeader title={note.title} subtitle={subtitle} subtitleFont="sans" />

      <nav aria-label="Části schůzky" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-navy-100">
          {(['shrnuti', 'prepis'] as const).map((t) => (
            <li key={t}>
              <Link
                href={t === 'shrnuti' ? base : `${base}?pohled=prepis`}
                aria-current={tab === t ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-[44px] items-center border-b-2 px-4 text-sm font-medium transition-colors',
                  tab === t ? 'border-navy-700 text-navy-700' : 'border-transparent text-quiet hover:text-ink',
                )}
              >
                {t === 'shrnuti' ? 'Shrnutí' : 'Přepis'}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'prepis' ? (
        <Card>
          <CardHead
            title="Doslovný přepis"
            hint={`${note.transcript.length.toLocaleString('cs-CZ')} znaků, přesně jak přišel. Klientovi se neposílá.`}
            action={
              <>
                <CopyTextButton text={note.transcript} label="Zkopírovat přepis" done="Přepis je ve schránce." />
                {note.shareLink && (
                  <a
                    href={note.shareLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-ink transition-colors hover:bg-navy-50"
                  >
                    <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
                    Ve Wispr Flow
                  </a>
                )}
              </>
            }
          />
          {incomplete && (
            <p className="mb-4 rounded-chip border border-dashed border-signal-line bg-signal-bg p-3 text-sm text-signal-ink">
              Wispr Flow hlásil {note.declaredChars?.toLocaleString('cs-CZ')} znaků, dorazilo{' '}
              {note.transcript.length.toLocaleString('cs-CZ')}. Přepis může být neúplný, porovnejte ho s Wispr Flow.
            </p>
          )}
          <TranscriptView transcript={note.transcript} speakers={ai?.speakers ?? []} />
        </Card>
      ) : (
        <>
          <Card>
            <CardHead title="Klient" hint={note.contact ? undefined : 'Potvrďte, o koho jde. Teprve pak vznikne koncept e-mailu.'} />
            <ClientPanel
              noteId={note.id}
              contact={note.contact}
              contactSource={note.contactSource}
              candidate={note.candidate}
              suggestedName={suggestedName}
              matchReason={ai?.matchReason || null}
              isClient={ai ? ai.isClient : null}
              aiReady={ai !== null}
              fillForCandidate={ai && note.candidate ? plannedFill(note.candidate, ai.client) : []}
              fillForNew={ai ? plannedFill(null, ai.client) : []}
            />
          </Card>

          <Card>
            <CardHead title="Shrnutí" />
            {note.aiStatus === 'pending' && ai === null ? (
              <p className="text-sm text-quiet">AI přepis zpracovává. Obvykle to trvá do minuty, pak obnovte stránku.</p>
            ) : note.aiStatus === 'failed' && ai === null ? (
              <p className="text-sm text-danger">{note.aiError ?? 'Shrnutí se nepodařilo vytvořit.'} Zkuste „Shrnout znovu".</p>
            ) : ai ? (
              <div className="flex flex-col gap-5">
                {ai.summary && <p className="text-[15px] leading-relaxed text-ink">{ai.summary}</p>}
                <Points title="Na čem jsme se domluvili" items={ai.agreements} />
                <Points title="Co udělám já" items={ai.mySteps} />
                <Points title="Co udělá klient" items={ai.clientSteps} />
                <Points title="Co zůstalo otevřené" items={ai.openQuestions} />
                {ai.internalNotes.length > 0 && (
                  <div className="rounded-chip border border-navy-100 bg-navy-50 p-4">
                    <Points title="Jen pro vás (do e-mailu nejde)" items={ai.internalNotes} />
                  </div>
                )}
                {note.aiStatus === 'pending' && <p className="text-sm text-quiet">Přepis se změnil, shrnutí se právě dělá znovu.</p>}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHead title="E-mail klientovi" hint="Jen shrnutí a domluvené kroky. Přepis zůstává tady." />
            <EmailPanel
              noteId={note.id}
              hasContact={note.contact !== null}
              contactEmail={note.contact?.email ?? null}
              emailTo={note.emailTo}
              hasDraft={note.gmailDraftId !== null}
              draftAt={note.gmailDraftAt ? stamp(note.gmailDraftAt) : null}
              gmailError={note.gmailError}
              draftsUrl={draftsUrl}
              preview={preview ? { subject: preview.subject, text: preview.text } : null}
              emptyReason={emptyReason}
            />
          </Card>

          <NoteActions noteId={note.id} hidden={note.hidden} />
        </>
      )}
    </PageShell>
  )
}
