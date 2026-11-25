'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, EyeOff, Eye, RefreshCw, UserPlus } from 'lucide-react'
import {
  confirmClient,
  hideNote,
  redraftEmail,
  relinkClient,
  reprocessNote,
  unlinkClient,
} from '@/app/meeting-notes-actions'
import { ContactPicker } from '@/components/admin/contact-picker'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import type { DraftResult, FillPlan } from '@/lib/admin/meeting-notes/process'
import type { ContactSource, MeetingContact } from '@/lib/admin/meeting-notes/store'

/**
 * Ovládání detailu schůzky (R-144). Nic se neodesílá: klienta potvrzujete
 * jedním kliknutím (přepis mluvil klient, R-111) a e-mail je jen koncept
 * v Gmailu. Odpojení klienta a skrytí jdou vrátit tlačítkem Zpět v toastu.
 */

const SOURCE_TEXT: Record<ContactSource, string> = {
  email: 'Přiřazeno podle e-mailu účastníka.',
  telefon: 'Přiřazeno podle telefonu.',
  kalendar: 'Přiřazeno podle schůzky v kalendáři.',
  potvrzeno: 'Potvrdili jste.',
}

export function CopyTextButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(done)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Kopírování se nepovedlo. Označte text a zkopírujte ho ručně.')
    }
  }
  return (
    <Button type="button" variant="outline" onClick={copy} className="h-11 px-4 text-sm">
      {copied ? <Check size={16} strokeWidth={1.75} aria-hidden /> : <Copy size={16} strokeWidth={1.75} aria-hidden />}
      {copied ? 'Zkopírováno' : label}
    </Button>
  )
}

function draftMessage(draft: DraftResult): string {
  if (draft.status === 'created') return `Koncept e-mailu pro ${draft.to} čeká v Gmailu.`
  return draft.reason
}

function FillList({ plan }: { plan: FillPlan[] }) {
  if (plan.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-quiet">Doplní se do kontaktu (jen prázdná pole):</p>
      <ul className="flex flex-col gap-0.5 text-sm text-ink">
        {plan.map((p) => (
          <li key={p.field}>
            <span className="text-quiet">{p.label}:</span> {p.value}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ClientPanel({
  noteId,
  contact,
  contactSource,
  candidate,
  suggestedName,
  matchReason,
  isClient,
  aiReady,
  fillForCandidate,
  fillForNew,
}: {
  noteId: string
  contact: MeetingContact | null
  contactSource: ContactSource | null
  candidate: MeetingContact | null
  /** Jméno nebo firma, které AI v přepisu našla. */
  suggestedName: string | null
  matchReason: string | null
  isClient: boolean | null
  aiReady: boolean
  fillForCandidate: FillPlan[]
  fillForNew: FillPlan[]
}) {
  const [pending, start] = useTransition()
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')

  const confirm = (contactId: string | null) =>
    start(async () => {
      const result = await confirmClient(noteId, contactId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPicking(false)
      toast.success(
        result.filled.length > 0 ? `Klient potvrzený. Doplněno: ${result.filled.join(', ').toLowerCase()}.` : 'Klient potvrzený.',
        { description: draftMessage(result.draft) },
      )
    })

  const unlink = () =>
    start(async () => {
      const result = await unlinkClient(noteId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const previous = result.previous
      toast.success('Klient je odpojený. Vyberte správného.', {
        undo:
          previous.contactId !== null
            ? () =>
                start(async () => {
                  await relinkClient(noteId, previous.contactId as string, previous.source ?? 'potvrzeno')
                })
            : undefined,
      })
    })

  const picker = (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-ink">Vybrat kontakt</p>
      <ContactPicker
        value={query}
        onChange={setQuery}
        onPick={(c) => confirm(c.id)}
        placeholder="Jméno, firma, e-mail nebo telefon"
      />
    </div>
  )

  if (contact !== null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link href={`/dashboard/kontakty/${contact.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
              {contact.name}
            </Link>
            <span className="text-sm text-quiet">
              {[contact.company, contact.email, contact.phone].filter(Boolean).join(' · ') || 'Bez kontaktních údajů'}
            </span>
            {contactSource && <span className="text-xs text-quiet">{SOURCE_TEXT[contactSource]}</span>}
          </div>
          <Button type="button" variant="outline" onClick={unlink} disabled={pending} className="h-11 px-4 text-sm">
            Není to on
          </Button>
        </div>
      </div>
    )
  }

  if (!aiReady) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-quiet">AI ještě přepis zpracovává. Klienta můžete vybrat i hned.</p>
        {picker}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {candidate !== null ? (
        <div className="flex flex-col gap-3 rounded-chip border border-dashed border-signal-line bg-signal-bg p-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-signal-ink">Podle AI jde o</p>
            <p className="font-medium text-ink">
              {candidate.name}
              {candidate.company ? <span className="font-normal text-quiet"> · {candidate.company}</span> : null}
            </p>
            {matchReason && <p className="text-sm text-quiet">{matchReason}</p>}
          </div>
          <FillList plan={fillForCandidate} />
          <div>
            <Button type="button" onClick={() => confirm(candidate.id)} disabled={pending}>
              <Check size={16} strokeWidth={1.75} aria-hidden />
              Ano, je to {candidate.name}
            </Button>
          </div>
        </div>
      ) : isClient === false ? (
        <p className="text-sm text-quiet">
          Podle AI se schůzka netýká klienta (pohovor, mentoring, osobní hovor). Když přece jen ano, vyberte kontakt níž.
        </p>
      ) : suggestedName ? (
        <div className="flex flex-col gap-3 rounded-chip border border-dashed border-signal-line bg-signal-bg p-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-signal-ink">V přepisu zazněl nový klient</p>
            <p className="font-medium text-ink">{suggestedName}</p>
            <p className="text-sm text-quiet">V Kontaktech ho nemáte. Založením se uloží s údaji z přepisu.</p>
          </div>
          <FillList plan={fillForNew} />
          <div>
            <Button type="button" onClick={() => confirm(null)} disabled={pending}>
              <UserPlus size={16} strokeWidth={1.75} aria-hidden />
              Založit kontakt
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-quiet">AI z přepisu nepoznala, o koho jde. Vyberte kontakt.</p>
      )}

      {candidate !== null && !picking ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPicking(true)} className="h-11 px-4 text-sm">
            Je to někdo jiný
          </Button>
          {suggestedName && (
            <Button type="button" variant="ghost" onClick={() => confirm(null)} disabled={pending} className="h-11 px-4 text-sm">
              <UserPlus size={16} strokeWidth={1.75} aria-hidden />
              Nový kontakt {suggestedName}
            </Button>
          )}
        </div>
      ) : (
        picker
      )}
    </div>
  )
}

export function EmailPanel({
  noteId,
  hasContact,
  contactEmail,
  emailTo,
  hasDraft,
  draftAt,
  gmailError,
  draftsUrl,
  preview,
  emptyReason,
}: {
  noteId: string
  hasContact: boolean
  contactEmail: string | null
  emailTo: string | null
  hasDraft: boolean
  draftAt: string | null
  gmailError: string | null
  draftsUrl: string
  preview: { subject: string; text: string } | null
  emptyReason: string | null
}) {
  const [pending, start] = useTransition()

  const draft = () =>
    start(async () => {
      const result = await redraftEmail(noteId)
      if (result.status === 'created') toast.success(`Koncept pro ${result.to} je v Gmailu.`)
      else toast.error(result.reason)
    })

  return (
    <div className="flex flex-col gap-4">
      {hasDraft ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            Koncept čeká v Gmailu pro <span className="font-medium">{emailTo}</span>
            {draftAt ? <span className="text-quiet"> · založen {draftAt}</span> : null}. Přečtěte ho a odešlete odtamtud.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={draftsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-700 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-navy-800"
            >
              <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
              Otevřít Koncepty v Gmailu
            </a>
            <Button type="button" variant="outline" onClick={draft} disabled={pending} className="h-11 px-4 text-sm">
              <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
              Založit znovu
            </Button>
          </div>
          {emailTo && contactEmail && emailTo !== contactEmail && (
            <p className="text-sm text-signal-ink">Kontakt má teď jiný e-mail ({contactEmail}). Založte koncept znovu.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-quiet">
            {emptyReason ?? gmailError ?? (hasContact ? 'Koncept zatím není v Gmailu.' : 'Koncept vznikne, jakmile potvrdíte klienta.')}
          </p>
          {hasContact && preview && (
            <div>
              <Button type="button" onClick={draft} disabled={pending}>
                Založit koncept v Gmailu
              </Button>
            </div>
          )}
        </div>
      )}

      {preview && (
        <details className="group rounded-chip border border-navy-100">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-ink">Náhled e-mailu</summary>
          <div className="flex flex-col gap-3 border-t border-navy-100 p-4">
            <p className="text-sm">
              <span className="text-quiet">Předmět:</span> {preview.subject}
            </p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{preview.text}</pre>
            <div>
              <CopyTextButton text={preview.text} label="Zkopírovat text" done="Text e-mailu je ve schránce." />
            </div>
          </div>
        </details>
      )}
    </div>
  )
}

export function NoteActions({ noteId, hidden }: { noteId: string; hidden: boolean }) {
  const [pending, start] = useTransition()

  const reprocess = () =>
    start(async () => {
      const result = await reprocessNote(noteId)
      if (result.ok) toast.success('Shrnutí se dělá znovu. Za chvíli obnovte stránku.')
      else toast.error('Nepodařilo se to.')
    })

  const toggle = () =>
    start(async () => {
      const result = await hideNote(noteId, !hidden)
      if (!result.ok) {
        toast.error('Nepodařilo se to.')
        return
      }
      toast.success(hidden ? 'Schůzka je zpět mezi ostatními.' : 'Schůzka je skrytá.', {
        undo: () => start(async () => void (await hideNote(noteId, hidden))),
      })
    })

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={reprocess} disabled={pending} className="h-11 px-4 text-sm">
        <RefreshCw size={16} strokeWidth={1.75} aria-hidden />
        Shrnout znovu
      </Button>
      <Button type="button" variant="ghost" onClick={toggle} disabled={pending} className="h-11 px-4 text-sm">
        {hidden ? <Eye size={16} strokeWidth={1.75} aria-hidden /> : <EyeOff size={16} strokeWidth={1.75} aria-hidden />}
        {hidden ? 'Vrátit mezi schůzky' : 'Skrýt, netýká se klienta'}
      </Button>
    </div>
  )
}
