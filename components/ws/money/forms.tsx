'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import {
  addTransactionAction,
  extractInvoiceAction,
  importInvoiceAction,
  saveTaxAction,
} from '@/app/w/[business]/faktury/actions'
import type { TaxSettings } from '@/lib/ws/money/schema'
import { DEFAULT_TAX } from '@/lib/ws/money/defaults'

const selectClass='min-h-11 w-full rounded-chip border bg-surface px-3 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm text-quiet">{label}{children}</label>
}

function PaymentMethod() {
  return <Field label="Způsob platby">
    <select className={selectClass} name="method" defaultValue="transfer">
      <option value="transfer">Převodem</option>
      <option value="cash">Hotově</option>
      <option value="card">Kartou</option>
      <option value="other">Jinak</option>
    </select>
  </Field>
}

export function TransactionForm({slug,today,closeHref}:{slug:string;today:string;closeHref:string}) {
  const {run,pending}=useWsAction()
  const router=useRouter()

  return <form className="flex flex-col gap-4" onSubmit={event=>{
    event.preventDefault()
    const data=new FormData(event.currentTarget)
    void run(()=>addTransactionAction({
      slug,
      kind:data.get('kind'),
      amount:Number(data.get('amount')),
      currency:data.get('currency'),
      day:data.get('day'),
      category:data.get('category'),
      description:data.get('description'),
      method:data.get('method'),
    }),()=>{
      toast.success('Platba je zapsaná.')
      router.push(closeHref)
    })
  }}>
    <Field label="Typ">
      <select className={selectClass} name="kind">
        <option value="income">Příjem</option>
        <option value="expense">Výdaj</option>
      </select>
    </Field>
    <Field label="Částka"><Input name="amount" type="number" min=".01" step=".01" required/></Field>
    <Field label="Měna">
      <select className={selectClass} name="currency"><option>CZK</option><option>EUR</option></select>
    </Field>
    <Field label="Datum platby"><Input name="day" type="date" max={today} defaultValue={today} required/></Field>
    <Field label="Kategorie">
      <Input name="category" list="money-categories" maxLength={80} required/>
      <datalist id="money-categories">{['Služby','Materiál','Nájem','Doprava','Vybavení','Ostatní'].map(category=><option key={category}>{category}</option>)}</datalist>
    </Field>
    <Field label="Poznámka"><Input name="description" maxLength={500}/></Field>
    <PaymentMethod/>
    <Button type="submit" disabled={pending}>Zapsat platbu</Button>
  </form>
}

export function ReceivedForm({slug,today,closeHref,ai}:{slug:string;today:string;closeHref:string;ai:boolean}) {
  const {run,pending}=useWsAction()
  const router=useRouter()
  const [values,setValues]=useState<Record<string,string>>({
    number:'',name:'',address:'',ico:'',issuedOn:today,dueOn:today,amount:'',currency:'CZK',note:'',
  })
  const [file,setFile]=useState<File|null>(null)
  const formData=()=>{
    const data=new FormData()
    for(const [key,value] of Object.entries(values))data.set(key,value)
    data.set('slug',slug)
    if(file)data.set('pdf',file)
    return data
  }

  return <form className="flex flex-col gap-4" onSubmit={event=>{
    event.preventDefault()
    void run(()=>importInvoiceAction(formData()),result=>{
      toast.success('Faktura je uložená.')
      router.push('/w/'+slug+'/faktury?detail=faktura:'+result.id)
    })
  }}>
    <Field label="PDF do 4 MB"><Input type="file" accept="application/pdf,.pdf" onChange={event=>setFile(event.target.files?.[0]??null)}/></Field>
    {ai&&<Button type="button" variant="outline" disabled={!file||pending} onClick={()=>void run(()=>extractInvoiceAction(formData()),result=>{
      setValues(current=>({...current,...Object.fromEntries(Object.entries(result)
        .filter(([,value])=>value!==null).map(([key,value])=>[key,String(value)]))}))
      toast.message('Údaje jsou přepsané. Před uložením je zkontrolujte.')
    })}>Přepsat z PDF</Button>}
    <p className="text-sm text-quiet">Přepis odešle dokument službě Anthropic. Údaje před uložením zkontrolujte. Datum platby vyplníte až po zaplacení.</p>
    {(['number','name','address','ico','issuedOn','dueOn','amount','currency','note'] as const).map(key=>{
      const labels={number:'Číslo faktury',name:'Dodavatel',address:'Adresa',ico:'IČO',issuedOn:'Vystaveno',dueOn:'Splatnost',amount:'Částka včetně DPH',currency:'Měna',note:'Poznámka'}
      return <Field key={key} label={labels[key]}>
        {key==='currency'?<select className={selectClass} value={values[key]} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}>
          <option>CZK</option><option>EUR</option>
        </select>:<Input type={key.endsWith('On')?'date':key==='amount'?'number':'text'} min={key==='amount'?0:undefined}
          step={key==='amount'?'.01':undefined} required={!['ico','address','note'].includes(key)}
          maxLength={key==='note'?2000:key==='ico'?8:400} value={values[key]}
          onChange={event=>setValues(current=>({...current,[key]:event.target.value}))}/>}
      </Field>
    })}
    <Button type="submit" disabled={pending}>Uložit fakturu</Button>
    <Link href={closeHref} className="inline-flex min-h-11 items-center text-sm text-quiet">Zpět</Link>
  </form>
}

export function TaxForm({slug,settings=DEFAULT_TAX}:{slug:string;settings?:TaxSettings}) {
  const {run,pending}=useWsAction()
  return <form className="flex flex-col gap-4" onSubmit={event=>{
    event.preventDefault()
    const data=new FormData(event.currentTarget)
    void run(()=>saveTaxAction({
      slug,
      mode:data.get('mode'),
      flatRate:Number(data.get('flatRate')),
      vatPayer:data.has('vatPayer'),
      sideActivity:data.has('sideActivity'),
      months:Number(data.get('months')),
      healthMinimum:data.has('healthMinimum'),
      taxpayerCredit:data.has('taxpayerCredit'),
      flatBand:Number(data.get('flatBand')),
      filing:data.get('filing'),
      advances:Number(data.get('advances')),
    }),()=>toast.success('Nastavení je uložené.'))
  }}>
    <p className="text-sm text-quiet">Nastavení platí pro celý účet, tedy jedno IČO. Odhad není daňové poradenství.</p>
    <Field label="Režim">
      <select className={selectClass} name="mode" defaultValue={settings.mode}>
        <option value="flat_expenses">Výdaje procentem</option><option value="real">Skutečné výdaje</option><option value="flat_tax">Paušální daň</option>
      </select>
    </Field>
    <Field label="Výdajový paušál">
      <select className={selectClass} name="flatRate" defaultValue={settings.flatRate}>{[30,40,60,80].map(value=><option key={value} value={value}>{value} %</option>)}</select>
    </Field>
    <Field label="Pásmo paušální daně">
      <select className={selectClass} name="flatBand" defaultValue={settings.flatBand}>{[1,2,3].map(value=><option key={value}>{value}</option>)}</select>
    </Field>
    <Field label="Měsíců činnosti za rok"><Input name="months" type="number" min="1" max="12" defaultValue={settings.months} required/></Field>
    {(['vatPayer','sideActivity','healthMinimum','taxpayerCredit'] as const).map(key=>{
      const labels={vatPayer:'Jsem plátce DPH',sideActivity:'Podnikám na vedlejší činnost',healthMinimum:'Platí pro mě minimum zdravotního pojištění',taxpayerCredit:'Uplatním celou slevu na poplatníka'}
      return <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input name={key} type="checkbox" defaultChecked={settings[key]}/>{labels[key]}</label>
    })}
    <p className="text-sm text-quiet">Pokud slevu využíváte v zaměstnání, vypněte ji. Výpočet nezahrnuje mzdu, děti, odpočty ani začínající OSVČ se sníženým minimem.</p>
    <Field label="Uhrazené daně a pojistné"><Input name="advances" type="number" min="0" step=".01" defaultValue={settings.advances} required/></Field>
    <Field label="Podání přiznání">
      <select className={selectClass} name="filing" defaultValue={settings.filing}>
        <option value="electronic">Elektronicky</option><option value="paper">Papírově</option><option value="advisor">S poradcem</option>
      </select>
    </Field>
    <Button type="submit" disabled={pending}>Uložit nastavení</Button>
  </form>
}
