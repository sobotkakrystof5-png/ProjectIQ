'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { saveIssuerProfileAction } from '@/app/w/[business]/faktury/actions'
import type { IssuerProfile } from '@/lib/ws/money/data'

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm text-quiet">{label}{children}</label>
}

export function IssuerProfileForm({slug,profile,readOnly}:{slug:string;profile:IssuerProfile;readOnly:boolean}) {
  const [draft,setDraft]=useState(profile)
  const {run,pending}=useWsAction()
  const set=(key:keyof IssuerProfile,value:string|boolean)=>setDraft(previous=>({...previous,[key]:value}))

  return <form className="flex flex-col gap-4" onSubmit={event=>{
    event.preventDefault()
    void run(()=>saveIssuerProfileAction({...draft,slug,email:''}),()=>toast.success('Údaje dodavatele jsou uložené.'))
  }}>
    <p className="text-sm text-quiet">Tyto údaje se uloží na každou novou fakturu.</p>
    <Field label="Jméno nebo firma"><Input required maxLength={160} value={draft.name} onChange={event=>set('name',event.target.value)}/></Field>
    <Field label="Adresa"><Input required maxLength={400} value={draft.address} onChange={event=>set('address',event.target.value)}/></Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="IČO"><Input required inputMode="numeric" maxLength={8} value={draft.ico} onChange={event=>set('ico',event.target.value)}/></Field>
      <Field label="DIČ"><Input required={draft.vatPayer} maxLength={20} value={draft.dic} onChange={event=>set('dic',event.target.value)}/></Field>
    </div>
    <Field label="Bankovní účet nebo IBAN"><Input maxLength={80} value={draft.bank} onChange={event=>set('bank',event.target.value)} placeholder="CZ… nebo číslo účtu"/></Field>
    <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
      <input type="checkbox" checked={draft.vatPayer} onChange={event=>set('vatPayer',event.target.checked)}/>
      Jsem plátce DPH
    </label>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={readOnly||pending}>Uložit údaje</Button>
      {readOnly&&<span className="text-sm text-quiet">Účet je teď jen pro čtení.</span>}
    </div>
  </form>
}
