'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { saveIssuer } from '@/app/dashboard/finance/invoice-actions'
import type { IssuerProfile } from '@/lib/admin/invoice-issue-schema'

/**
 * Údaje dodavatele (AD12). Vyplňují se jednou a pak se na každou fakturu
 * uloží jako snímek — pozdější změna adresy nebo účtu nepřepíše doklady,
 * které už odešly.
 */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-quiet">{hint}</span>}
    </label>
  )
}

export function IssuerForm({ initial }: { initial: IssuerProfile }) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const set = (patch: Partial<IssuerProfile>) => setForm(prev => ({ ...prev, ...patch }))

  const save = () => {
    setError(null)
    start(async () => {
      const result = await saveIssuer(form)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success('Uloženo')
    })
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        save()
      }}
    >
      <Field label="Jméno nebo firma" hint="Právní jméno podle rejstříku. U živnosti vaše jméno a příjmení.">
        <Input value={form.name} onChange={e => set({ name: e.target.value })} required />
      </Field>
      <Field label="Obchodní značka" hint="Nepovinné. Na faktuře bude velká v hlavičce, třeba VIZEON.">
        <Input value={form.tradeName} onChange={e => set({ tradeName: e.target.value })} maxLength={80} />
      </Field>
      <Field label="Adresa" hint="Tak, jak má být na faktuře — ulice, město, PSČ.">
        <Input value={form.address} onChange={e => set({ address: e.target.value })} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="IČO">
          <Input
            value={form.ico}
            inputMode="numeric"
            maxLength={8}
            onChange={e => set({ ico: e.target.value.replace(/\D/g, '').slice(0, 8) })}
            required
          />
        </Field>
        <Field label="DIČ" hint="Plátce DPH ho mít musí, neplátce jen pokud ho má.">
          <Input value={form.dic} onChange={e => set({ dic: e.target.value })} />
        </Field>
      </div>
      <Field
        label="Kde jste zapsaní"
        hint="Na faktuře být musí. U živnosti: Fyzická osoba zapsaná v živnostenském rejstříku a název úřadu. U firmy: obchodní rejstřík, soud, oddíl a vložka."
      >
        <Input
          value={form.registry}
          onChange={e => set({ registry: e.target.value })}
          maxLength={300}
          placeholder="Fyzická osoba zapsaná v živnostenském rejstříku, Magistrát města …"
          required
        />
      </Field>
      <Field label="Účet (IBAN)" hint="Z IBANu se na faktuře vykreslí číslo účtu i QR kód k zaplacení.">
        <Input value={form.bank} onChange={e => set({ bank: e.target.value })} placeholder="CZ65 0800 0000 1920 0014 5399" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="E-mail" hint="Nepovinné, tiskne se na fakturu.">
          <Input value={form.email} onChange={e => set({ email: e.target.value })} type="email" />
        </Field>
        <Field label="Telefon" hint="Nepovinné.">
          <Input value={form.phone} onChange={e => set({ phone: e.target.value })} type="tel" maxLength={30} />
        </Field>
        <Field label="Web" hint="Nepovinné, třeba vizeon.cz.">
          <Input value={form.web} onChange={e => set({ web: e.target.value })} maxLength={120} />
        </Field>
      </div>
      <label className="flex items-center gap-3 rounded-chip border border-input bg-surface px-3.5 py-3">
        <input
          type="checkbox"
          checked={form.vatPayer}
          onChange={e => set({ vatPayer: e.target.checked })}
          className="h-5 w-5 accent-navy-700"
        />
        <span className="text-sm text-ink">
          Jsem plátce DPH
          <span className="block text-xs text-quiet">Nezaškrtnuté: faktury se vystavují bez DPH a s větou „Dodavatel není plátcem DPH.“</span>
        </span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Ukládám…' : 'Uložit údaje'}
        </Button>
      </div>
    </form>
  )
}
