'use client'

import { useState, useTransition } from 'react'
import { saveContact, type ContactFormValues } from '@/app/contacts-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'

/**
 * Údaje kontaktu (AD09). Jediný klientský kus karty — zbytek se kreslí
 * na serveru.
 *
 * Telefon se ukládá v jednom tvaru (`+420777123456`), ale psát ho jde jakkoli:
 * co se nepodaří přečíst, obrazovka řekne rovnou, místo aby to spadlo na
 * databázi.
 */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-quiet">{hint}</span>}
    </label>
  )
}

export function ContactForm({ id, initial }: { id: string; initial: ContactFormValues }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const set = <K extends keyof ContactFormValues>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value === '' ? null : value }) as ContactFormValues)

  const save = () => {
    setError(null)
    start(async () => {
      const result = await saveContact(id, form)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Uloženo')
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Field label="Jméno">
        <Input value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} required />
      </Field>
      <Field label="Firma">
        <Input value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefon" hint="Stačí 777 123 456, uloží se jako +420777123456.">
          <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
        </Field>
        <Field label="E-mail">
          <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} type="email" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="IČO">
          <Input value={form.ico ?? ''} onChange={(e) => set('ico', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="DIČ">
          <Input value={form.dic ?? ''} onChange={(e) => set('dic', e.target.value)} />
        </Field>
      </div>
      <Field label="Poznámka">
        <textarea
          value={form.note ?? ''}
          onChange={(e) => set('note', e.target.value)}
          rows={3}
          className="w-full rounded-chip border border-input bg-surface px-3.5 py-2.5 text-[15px] text-ink transition-colors placeholder:text-quiet focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </Field>

      {error !== null && (
        <p role="alert" className="rounded-chip bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Ukládám…' : 'Uložit'}
        </Button>
      </div>
    </form>
  )
}
