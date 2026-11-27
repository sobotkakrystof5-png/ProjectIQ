'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Sparkles, Trash2, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ContactPicker } from '@/components/admin/contact-picker'
import {
  deleteVoiceMeeting,
  renameVoiceMeeting,
  setVoiceMeetingContact,
  summarizeVoiceMeeting,
} from '@/app/voice-actions'

/** Ovládání schůzky v adminu (R-151): shrnutí, kopírování, kontakt, název, smazání. */

export function MeetingCopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast.success('Zkopírováno')
        } catch {
          toast.error('Zkopírovat se nepodařilo. Označte text a zkopírujte ho ručně.')
        }
      }}
    >
      <Copy size={16} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </Button>
  )
}

export function MeetingSummarizeButton({ id, again, disabled }: { id: string; again: boolean; disabled: boolean }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <Button
      type="button"
      variant={again ? 'outline' : 'primary'}
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = await summarizeVoiceMeeting(id)
          if (!res.ok) return void toast.error(res.error)
          toast.success('Shrnutí je hotové')
          router.refresh()
        })
      }
    >
      <Sparkles size={16} strokeWidth={1.5} aria-hidden="true" />
      {pending ? 'Shrnuji…' : again ? 'Shrnout znovu' : 'Shrnout pomocí AI'}
    </Button>
  )
}

export function MeetingContact({ id, contactId, contactName }: { id: string; contactId: string | null; contactName: string | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()

  const save = (next: string | null) =>
    start(async () => {
      const res = await setVoiceMeetingContact(id, next)
      if (!res.ok) return void toast.error(res.error)
      setEditing(false)
      setValue('')
      router.refresh()
    })

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">Ke kterému klientovi schůzka patří?</p>
        <ContactPicker
          value={value}
          onChange={setValue}
          onPick={(c) => save(c.id)}
          placeholder="Jméno, firma nebo telefon"
        />
        <div>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
            Zrušit
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <UserRound size={16} strokeWidth={1.5} aria-hidden="true" className="text-quiet" />
      {contactId ? (
        <>
          <a href={`/dashboard/kontakty/${contactId}`} className="font-medium text-navy-700 underline-offset-2 hover:underline">
            {contactName ?? 'Kontakt'}
          </a>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
            Změnit
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => save(null)} aria-label="Odpojit kontakt">
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
          Přiřadit ke klientovi
        </Button>
      )}
    </div>
  )
}

export function MeetingActions({ id, title }: { id: string; title: string | null }) {
  const [confirm, setConfirm] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(title ?? '')
  const [pending, start] = useTransition()
  const router = useRouter()

  if (renaming) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await renameVoiceMeeting(id, name)
            if (!res.ok) return void toast.error(res.error)
            setRenaming(false)
            router.refresh()
          })
        }}
      >
        <label className="sr-only" htmlFor={`nazev-${id}`}>
          Název schůzky
        </label>
        <input
          id={`nazev-${id}`}
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
          className="h-11 min-w-0 rounded-md border border-input bg-surface px-3 text-sm"
          placeholder="Název schůzky"
        />
        <Button type="submit" disabled={pending}>
          Uložit
        </Button>
        <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
          Zrušit
        </Button>
      </form>
    )
  }

  if (confirm) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Potvrzení smazání">
        <span className="text-sm text-ink">Smazat schůzku i s přepisem?</span>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteVoiceMeeting(id)
              if (!res.ok) return void toast.error(res.error)
              toast.success('Schůzka smazaná')
              router.push('/dashboard/voice?tab=schuzky')
              router.refresh()
            })
          }
        >
          Smazat
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
          Nechat
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="ghost" onClick={() => setRenaming(true)}>
        Přejmenovat
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
        <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
        Smazat
      </Button>
    </div>
  )
}
