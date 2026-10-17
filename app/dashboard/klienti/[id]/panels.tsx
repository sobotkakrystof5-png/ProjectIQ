'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Copy, KeyRound, Mail } from 'lucide-react'
import { generateWebKeysAction, resendInviteAction, saveNoteAction } from '../actions'
import type { WebKeysResult } from '@/lib/ws/admin/web-keys'

const INPUT = 'w-full text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500'
const BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg bg-white hover:bg-muted transition-colors disabled:opacity-60'

function CopyField({ label, value, multiline = false, secret = false }: { label: string; value: string; multiline?: boolean; secret?: boolean }) {
  const copy = () => {
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label}: zkopírováno`),
      () => toast.error('Kopírování se nepovedlo, označ text ručně.'),
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline">
          <Copy size={12} strokeWidth={1.5} />
          Kopírovat
        </button>
      </div>
      {multiline ? (
        <textarea readOnly value={value} rows={8} className={`${INPUT} font-mono text-[12px]`} />
      ) : (
        <input readOnly value={value} className={`${INPUT} font-mono text-[12px] ${secret ? 'bg-amber-50' : ''}`} />
      )}
    </div>
  )
}

/**
 * Klíče a prompt pro web klienta (stejně jako Nastavení › Napojený web, S11).
 * Tajný klíč se ukáže jen teď — pak už ho nikdo nepřečte, jde jen vyměnit.
 */
export function WebKeysPanel({ accountId, businessId, hasSecret }: { accountId: string; businessId: string; hasSecret: boolean }) {
  const [pending, start] = useTransition()
  const [keys, setKeys] = useState<WebKeysResult | null>(null)
  const [confirm, setConfirm] = useState(false)

  const run = () => {
    start(async () => {
      const res = await generateWebKeysAction({ accountId, businessId })
      setConfirm(false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setKeys(res.data)
    })
  }

  if (keys) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <p className="text-[12px] text-amber-800">
          Tajný klíč se ukazuje jen teď. Ulož ho do env webu jako <code className="font-mono">ZAKAZIQ_KEY</code>, nikam jinam.
        </p>
        <CopyField label="Tajný klíč" value={keys.secretKey} secret />
        <CopyField label="Prompt pro Claude Code" value={keys.prompt} multiline />
        <CopyField label="Kód widgetu" value={keys.widgetCode} />
        <CopyField label="Objednávací stránka" value={keys.orderUrl} />
      </div>
    )
  }

  if (confirm && hasSecret) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-[12px] text-amber-800 flex-1 min-w-[200px]">Byznys už tajný klíč má. Nový ho hned zneplatní — web s tím starým přestane posílat poptávky.</p>
        <button type="button" onClick={run} disabled={pending} className={BUTTON}>
          {pending ? 'Vytvářím…' : 'Vyměnit klíč'}
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="text-sm text-muted-foreground hover:underline">
          Zpět
        </button>
      </div>
    )
  }

  return (
    <button type="button" onClick={() => (hasSecret ? setConfirm(true) : run())} disabled={pending} className={BUTTON}>
      <KeyRound size={14} strokeWidth={1.5} />
      {pending ? 'Vytvářím…' : 'Klíče a prompt pro web'}
    </button>
  )
}

export function ResendInviteForm({ accountId }: { accountId: string }) {
  const [pending, start] = useTransition()
  const [email, setEmail] = useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const res = await resendInviteAction({ accountId, email })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Pozvánka odešla.')
      setEmail('')
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <input
        type="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="e-mail vlastníka"
        aria-label="E-mail vlastníka"
        className={`${INPUT} flex-1 min-w-[200px]`}
      />
      <button type="submit" disabled={pending} className={BUTTON}>
        <Mail size={14} strokeWidth={1.5} />
        {pending ? 'Posílám…' : 'Poslat pozvánku'}
      </button>
    </form>
  )
}

export function NoteEditor({ accountId, initial }: { accountId: string; initial: string }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState(initial)
  const dirty = note !== initial

  const save = () => {
    start(async () => {
      const res = await saveNoteAction({ accountId, note })
      if (!res.ok) toast.error(res.error)
      else toast.success('Poznámka uložená.')
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={4000}
        rows={4}
        placeholder="Co je potřeba vědět — domluva, web, fakturace… Klient poznámku nevidí."
        aria-label="Poznámka k účtu"
        className={INPUT}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">{note.length} / 4000</span>
        <button type="button" onClick={save} disabled={pending || !dirty} className={BUTTON}>
          {pending ? 'Ukládám…' : 'Uložit poznámku'}
        </button>
      </div>
    </div>
  )
}
