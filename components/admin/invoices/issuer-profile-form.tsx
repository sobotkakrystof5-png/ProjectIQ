'use client'

import { useState, useTransition } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { lookupIcoAction, saveIssuerProfileAction } from '@/app/dashboard/faktury/actions'
import type { IssuerProfile } from '@/lib/admin/invoice-schema'

/**
 * Fakturační údaje — jeden dodavatel pro celou aplikaci (jedno IČO, R-011).
 *
 * Na vystavené faktuře zůstane snímek těchhle údajů, takže pozdější změna
 * adresy nebo účtu nepřepíše starší doklady.
 */

export function IssuerProfileForm({ profile }: { profile: IssuerProfile }) {
  const [value, setValue] = useState<IssuerProfile>(profile)
  const [pending, start] = useTransition()
  const [loadingAres, setLoadingAres] = useState(false)

  const set = <K extends keyof IssuerProfile>(key: K, next: IssuerProfile[K]) =>
    setValue((current) => ({ ...current, [key]: next }))

  function fromRegistry() {
    setLoadingAres(true)
    start(async () => {
      const result = await lookupIcoAction(value.ico)
      setLoadingAres(false)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setValue((current) => ({
        ...current,
        name: result.subject.name || current.name,
        address: result.subject.address || current.address,
        dic: result.subject.dic || current.dic,
        vatPayer: result.subject.dic !== '' ? true : current.vatPayer,
      }))
      toast.success('Údaje z rejstříku jsou doplněné.')
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    start(async () => {
      const result = await saveIssuerProfileAction(value)
      if (result.error) toast.error(result.error)
      else toast.success('Uloženo.')
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-box border border-navy-100 bg-surface p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ico">IČO</Label>
          <div className="flex gap-2">
            <Input
              id="ico" value={value.ico} inputMode="numeric" maxLength={8}
              onChange={(e) => set('ico', e.target.value.replace(/\D/g, ''))}
              placeholder="12345678"
            />
            <Button type="button" variant="outline" onClick={fromRegistry} disabled={pending || value.ico.length !== 8}>
              {loadingAres ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} strokeWidth={1.75} aria-hidden />}
              Z rejstříku
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Jméno nebo firma</Label>
          <Input id="name" value={value.name} maxLength={160} onChange={(e) => set('name', e.target.value)} required />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="address">Adresa</Label>
          <Input id="address" value={value.address} maxLength={400} onChange={(e) => set('address', e.target.value)} required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank">Bankovní účet (IBAN)</Label>
          <Input
            id="bank" value={value.bank} maxLength={80} onChange={(e) => set('bank', e.target.value)}
            placeholder="CZ65 0800 0000 1920 0014 5399"
          />
          <p className="text-xs text-quiet">Bez IBANu se na fakturu nedá nakreslit QR kód k zaplacení.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={value.email} maxLength={254} onChange={(e) => set('email', e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" value={value.phone} maxLength={40} onChange={(e) => set('phone', e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dic">DIČ</Label>
          <Input id="dic" value={value.dic} maxLength={20} onChange={(e) => set('dic', e.target.value)} placeholder="CZ12345678" />
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
        <input
          type="checkbox" checked={value.vatPayer} onChange={(e) => set('vatPayer', e.target.checked)}
          className="size-4 rounded border-input accent-navy-700"
        />
        Jsem plátce DPH
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}
          Uložit údaje
        </Button>
      </div>
    </form>
  )
}
