'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { undoToast, useWsAction } from '@/components/ws/app/booking/use-ws-action'
import {
  issueInvoiceAction,
  payInvoiceAction,
  queueInvoiceAction,
  undoInvoicePaymentAction,
} from '@/app/w/[business]/faktury/actions'
import type { getInvoiceOptions, Invoice } from '@/lib/ws/money/data'
import type { InvoiceItem, Party } from '@/lib/ws/money/schema'
import { invoiceTotal } from '@/lib/ws/money/calculations'
import { formatMoney } from '@/lib/ws/money'

const selectClass='min-h-11 w-full rounded-chip border bg-surface px-3 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const blankParty:Party={name:'',address:'',ico:'',dic:'',email:'',bank:''}
type Options=Awaited<ReturnType<typeof getInvoiceOptions>>

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-sm text-quiet">{label}{children}</label>
}

function PartyFields({title,value,onChange}:{title:string;value:Party;onChange:(party:Party)=>void}) {
  const fields:(keyof Party)[]=['name','address','ico','dic','email']
  const labels:Record<keyof Party,string>={name:'Jméno nebo firma',address:'Adresa',ico:'IČO',dic:'DIČ',email:'E-mail',bank:'Bankovní účet'}
  return <fieldset className="grid grid-cols-2 gap-3 rounded-box border p-4">
    <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
    {fields.map(key=><div key={key} className={key==='name'||key==='address'?'col-span-2':''}>
      <Field label={labels[key]}>
        <Input required={key==='name'||key==='address'} type={key==='email'?'email':'text'} value={value[key]}
          maxLength={key==='address'?400:key==='email'?254:key==='ico'?8:key==='dic'?20:160}
          onChange={event=>onChange({...value,[key]:event.target.value})}/>
      </Field>
    </div>)}
  </fieldset>
}

function addDays(day:string,count:number) {
  const date=new Date(day+'T00:00:00Z')
  date.setUTCDate(date.getUTCDate()+count)
  return date.toISOString().slice(0,10)
}

export function InvoiceForm({slug,today,options,closeHref,jobId,customerId}:{slug:string;today:string;options:Options;closeHref:string;jobId?:string;customerId?:string}) {
  const router=useRouter(),formRef=useRef<HTMLFormElement>(null)
  const {run,pending}=useWsAction()
  const initialJob=options.jobs.find(item=>item.id===jobId)
  const initialCustomer=options.customers.find(item=>item.id===(initialJob?.customerId??customerId))
  const [buyer,setBuyer]=useState<Party>({...blankParty,name:initialCustomer?.name??'',email:initialCustomer?.email??''})
  const [customer,setCustomer]=useState<string|null>(initialCustomer?.id??null)
  const [job,setJob]=useState<string|null>(initialJob?.id??null)
  const [currency,setCurrency]=useState<'CZK'|'EUR'>(initialJob?.currency==='EUR'?'EUR':'CZK')
  const [items,setItems]=useState<InvoiceItem[]>([{
    description:initialJob?.title??'',quantity:1,unitPrice:initialJob?.price??0,vatRate:0,
  }])
  const [dueDays,setDueDays]=useState(14)
  const [vat,setVat]=useState(options.profile.vatPayer)
  const profileReady=Boolean(options.profile.name.trim()&&options.profile.address.trim()&&/^\d{8}$/.test(options.profile.ico)&&(!options.profile.vatPayer||options.profile.dic.trim()))
  const customerOptions=useMemo(()=>options.customers.map(item=>({
    value:item.name+' — '+(item.email||'bez e-mailu'),customer:item,
  })),[options.customers])
  let total:number|null=null
  try{total=invoiceTotal(items)}catch{total=null}

  function selectJob(id:string) {
    const selected=options.jobs.find(item=>item.id===id)
    setJob(selected?.id??null)
    if(!selected)return
    const selectedCustomer=options.customers.find(item=>item.id===selected.customerId)
    setCustomer(selectedCustomer?.id??null)
    if(selectedCustomer)setBuyer({...blankParty,name:selectedCustomer.name,email:selectedCustomer.email})
    setCurrency(selected.currency==='EUR'?'EUR':'CZK')
    setItems([{description:selected.title,quantity:1,unitPrice:selected.price??0,vatRate:0}])
  }

  function selectCustomer(value:string) {
    const selected=customerOptions.find(option=>option.value===value)?.customer
    setCustomer(selected?.id??null)
    setBuyer({...blankParty,name:selected?.name??value,email:selected?.email??''})
  }

  // Celé napsané jméno bez výběru ze seznamu: bez vazby by fakturu nenašel výmaz zákazníka (R-054).
  function matchTypedCustomer() {
    if(customer)return
    const name=buyer.name.trim().toLocaleLowerCase('cs')
    const matches=name?options.customers.filter(item=>item.name.trim().toLocaleLowerCase('cs')===name):[]
    if(matches.length===1)selectCustomer(customerOptions.find(option=>option.customer.id===matches[0].id)!.value)
  }

  async function issue(intent:'send'|'download'|'only') {
    const form=formRef.current
    if(!form||!profileReady||!form.reportValidity())return
    const data=new FormData(form)
    const payload={
      slug,jobId:job,customerId:customer,
      issuer:{...options.profile,email:'',vatPayer:vat},counterparty:buyer,
      issuedOn:String(data.get('issuedOn')||today),suppliedOn:String(data.get('suppliedOn')||today),
      dueOn:String(data.get('dueOn')||addDays(today,dueDays)),currency,items,note:String(data.get('note')??''),
    }
    await run(()=>issueInvoiceAction(payload),result=>{
      const detail='/w/'+slug+'/faktury?detail=faktura:'+result.id
      if(intent==='only'){
        toast.success('Faktura je vystavená.')
        router.push(detail)
      }else if(intent==='download'){
        window.location.assign('/api/ws/'+slug+'/faktury/'+result.id+'/pdf')
      }else{
        router.push(detail)
        void run(()=>queueInvoiceAction({slug,id:result.id}),response=>toast.success(response.message))
      }
    })
  }

  return <form ref={formRef} className="flex flex-col gap-5" onSubmit={event=>{event.preventDefault();void issue(options.emailReady?'send':'download')}}>
    {!profileReady&&<div className="rounded-box border border-navy-100 bg-navy-50 p-4 text-sm text-ink">
      <p>Doplňte nejdřív údaje dodavatele.</p>
      <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-navy-700 underline dark:text-navy-200" href={'/w/'+slug+'/nastaveni/firma'}>Upravit dodavatele</Link>
    </div>}
    {profileReady&&<p className="text-sm text-quiet">Dodavatel: {options.profile.name} · <Link className="underline" href={'/w/'+slug+'/nastaveni/firma'}>Upravit dodavatele</Link></p>}

    <Field label="Hotová zakázka">
      <select className={selectClass} value={job??''} onChange={event=>selectJob(event.target.value)}>
        <option value="">Bez zakázky</option>
        {options.jobs.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </Field>
    <Field label="Zákazník">
      <Input list="invoice-customers" value={customerOptions.find(item=>item.customer.id===customer)?.value??buyer.name}
        disabled={Boolean(job)} placeholder="Začněte psát jméno" onChange={event=>selectCustomer(event.target.value)} onBlur={matchTypedCustomer}/>
      <datalist id="invoice-customers">{customerOptions.map(item=><option key={item.customer.id} value={item.value}/>)}</datalist>
    </Field>
    <PartyFields title="Odběratel" value={buyer} onChange={party=>{setBuyer(party);if(party.name!==buyer.name)setCustomer(null)}}/>

    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-ink">Položky faktury</legend>
      {options.services.length>0&&<div className="flex flex-wrap gap-2">
        {options.services.map(service=><Button key={service.id} type="button" variant="outline" onClick={()=>{
          setCurrency(service.currency==='EUR'?'EUR':'CZK')
          setItems(current=>[...current,{description:service.name,quantity:1,unitPrice:service.price??0,vatRate:0}])
        }}>{service.name}{service.price!==null?' · '+formatMoney(service.price,{currency:service.currency as 'CZK'|'EUR'}):''}</Button>)}
      </div>}
      {items.map((item,index)=><div key={index} className="grid grid-cols-2 gap-3 rounded-box border p-3">
        <div className="col-span-2"><Field label="Popis"><Input required maxLength={200} value={item.description} onChange={event=>setItems(current=>current.map((row,n)=>n===index?{...row,description:event.target.value}:row))}/></Field></div>
        <Field label="Počet"><Input type="number" min="0.001" max="100000" step="0.001" required value={item.quantity} onChange={event=>setItems(current=>current.map((row,n)=>n===index?{...row,quantity:Number(event.target.value)}:row))}/></Field>
        <Field label={vat?'Cena bez DPH':'Cena za kus'}><Input type="number" min="0" max="9999999999.99" step=".01" required value={item.unitPrice} onChange={event=>setItems(current=>current.map((row,n)=>n===index?{...row,unitPrice:Number(event.target.value)}:row))}/></Field>
        {vat&&<Field label="Sazba DPH">
          <select className={selectClass} value={item.vatRate} onChange={event=>setItems(current=>current.map((row,n)=>
            n===index?{...row,vatRate:Number(event.target.value) as 0|12|21}:row))}>
            {[0,12,21].map(rate=><option key={rate} value={rate}>{rate} %</option>)}
          </select>
        </Field>}
        {items.length>1&&<Button type="button" variant="ghost" onClick={()=>setItems(current=>current.filter((_,n)=>n!==index))}>Odebrat položku</Button>}
      </div>)}
      {items.length<50&&<Button type="button" variant="outline" onClick={()=>setItems(current=>[...current,{description:'',quantity:1,unitPrice:0,vatRate:0}])}>Přidat vlastní položku</Button>}
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-navy-50 p-4 dark:bg-navy-800">
      <span className="text-sm text-quiet">Celkem k úhradě</span>
      <strong className="font-num text-xl">{total===null?'Zkontrolujte částky':formatMoney(total,{currency})}</strong>
    </div>
    <div>
      <p className="mb-2 text-sm text-quiet">Splatnost od vystavení</p>
      <div className="flex gap-2">{[7,14,30].map(days=><Button key={days} type="button"
        variant={dueDays===days?'outline':'ghost'} aria-pressed={dueDays===days}
        onClick={()=>setDueDays(days)}>{days} dní</Button>)}</div>
      <input type="hidden" name="dueOn" value={addDays(today,dueDays)}/>
    </div>

    <details className="rounded-box border p-4">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">Další údaje</summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Vystaveno"><Input type="date" name="issuedOn" defaultValue={today} required/></Field>
        <Field label="Datum plnění"><Input type="date" name="suppliedOn" defaultValue={today} required/></Field>
        <Field label="Měna"><select className={selectClass} value={currency} onChange={event=>setCurrency(event.target.value as 'CZK'|'EUR')}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></Field>
        {options.profile.vatPayer&&<label className="col-span-2 flex min-h-11 items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={vat} onChange={event=>{
            setVat(event.target.checked)
            if(!event.target.checked)setItems(rows=>rows.map(row=>({...row,vatRate:0})))
          }}/>
          Na této faktuře účtovat DPH
        </label>}
        <div className="col-span-2"><Field label="Poznámka"><Input name="note" maxLength={2000}/></Field></div>
      </div>
    </details>

    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending||total===null||!profileReady}>{options.emailReady?'Vystavit a poslat':'Vystavit a stáhnout PDF'}</Button>
      <Button type="button" variant="outline" disabled={pending||total===null||!profileReady} onClick={()=>void issue('only')}>Jen vystavit</Button>
      <Link href={closeHref} className="inline-flex min-h-11 items-center text-sm text-quiet">Zpět</Link>
    </div>
  </form>
}

export function InvoicePayment({slug,invoice,today}:{slug:string;invoice:Invoice;today:string}) {
  const {run,pending}=useWsAction()
  return <div className="flex flex-col gap-4">
    {invoice.direction==='issued'||invoice.hasPdf
      ?<a className="inline-flex min-h-11 items-center font-semibold text-navy-700 dark:text-navy-200" href={'/api/ws/'+slug+'/faktury/'+invoice.id+'/pdf'}>Stáhnout PDF</a>
      :<p className="text-sm text-quiet">PDF není přiložené.</p>}
    {!invoice.paidOn&&invoice.status!=='cancelled'&&<form className="flex flex-col gap-3" onSubmit={event=>{
      event.preventDefault()
      const data=new FormData(event.currentTarget)
      void run(()=>payInvoiceAction({slug,id:invoice.id,day:data.get('day'),method:data.get('method')}),()=>undoToast(
        'Platba je zapsaná.',()=>undoInvoicePaymentAction({slug,id:invoice.id}),{done:'Platba byla vrácená.'},
      ))
    }}>
      <Field label="Datum platby"><Input name="day" type="date" max={today} defaultValue={today} required/></Field>
      <PaymentMethod/>
      <Button type="submit" disabled={pending}>Zapsat platbu</Button>
    </form>}
    {invoice.direction==='issued'&&<>
      <Button variant="outline" disabled={pending} onClick={()=>void run(
        ()=>queueInvoiceAction({slug,id:invoice.id}),response=>toast.success(response.message),
      )}>Poslat e-mailem</Button>
      <p className="text-sm text-quiet">Odběratel dostane e-mail s PDF v příloze. Odpověď přijde na váš e-mail.</p>
    </>}
  </div>
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
