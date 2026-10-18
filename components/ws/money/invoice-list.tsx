'use client'

import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { undoToast, useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { payInvoiceAction, undoInvoicePaymentAction } from '@/app/w/[business]/faktury/actions'
import type { Invoice } from '@/lib/ws/money/data'
import { formatMoney } from '@/lib/ws/money'
import { formatDayShort } from '@/lib/ws/time'

type InvoiceFilter='open'|'overdue'|'paid'
const filters:{key:InvoiceFilter;label:string}[]=[
  {key:'open',label:'K zaplacení'},
  {key:'overdue',label:'Po splatnosti'},
  {key:'paid',label:'Zaplacené'},
]

export function InvoiceList({slug,invoices,today,filter,all}:{slug:string;invoices:Invoice[];today:string;filter:InvoiceFilter;all:boolean}) {
  const issued=invoices.filter(invoice=>invoice.direction==='issued'&&invoice.status!=='cancelled')
  const received=invoices.filter(invoice=>invoice.direction==='received')
  const visible=issued.filter(invoice=>{
    const overdue=!invoice.paidOn&&invoice.dueOn<today
    if(filter==='paid')return Boolean(invoice.paidOn)
    if(filter==='overdue')return overdue
    return !invoice.paidOn&&!overdue
  })
  const totals=visible.reduce<Record<string,number>>((sum,invoice)=>{
    sum[invoice.currency]=(sum[invoice.currency]??0)+invoice.amount
    return sum
  },{})
  const detailHref=(invoice:Invoice)=>'/w/'+(invoice.businessSlug||slug)+'/faktury?detail=faktura:'+invoice.id

  return <div className="flex flex-col gap-5">
    <section className="rounded-panel border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Vystavené faktury</h2>
        <div className="flex flex-wrap gap-2" aria-label="Filtrovat faktury">
          {filters.map(item=><Link key={item.key} href={'/w/'+slug+'/faktury?stav='+item.key+(all?'&rozsah=ucet':'')} aria-current={filter===item.key?'page':undefined} className={buttonVariants({variant:filter===item.key?'outline':'ghost'})}>{item.label}</Link>)}
        </div>
      </div>
      <div className="my-4 flex flex-wrap gap-x-5 gap-y-2 border-b pb-4 text-sm">
        <span className="text-quiet">Součet ve filtru</span>
        {Object.entries(totals).length?Object.entries(totals).map(([currency,amount])=><strong key={currency} className="font-num">{formatMoney(amount,{currency:currency as 'CZK'|'EUR'})}</strong>):<span className="text-quiet">Zatím žádné faktury</span>}
      </div>
      {visible.length===0?<p className="text-sm text-quiet">V tomto přehledu zatím nic není.</p>:<ul className="divide-y">
        {visible.map(invoice=><InvoiceRow key={invoice.id} invoice={invoice} slug={invoice.businessSlug||slug} today={today} href={detailHref(invoice)} filter={filter}/>)}
      </ul>}
      {issued.length===500&&<p className="mt-4 text-sm text-quiet">Zobrazeno posledních 500 faktur. Starší najdete hledáním podle čísla.</p>}
    </section>
    <section className="rounded-panel border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">Přijaté faktury</h2>
      {received.length===0?<p className="text-sm text-quiet">Zatím nemáte žádnou přijatou fakturu.</p>:<ul className="divide-y">
        {received.map(invoice=><li key={invoice.id}>
          <Link href={detailHref(invoice)} className="flex min-h-16 flex-wrap items-center gap-2 py-3">
            <span className="min-w-0 flex-1"><span className="font-num text-sm">{invoice.number||'Bez čísla'}</span><span className="block truncate text-sm text-quiet">{invoice.counterparty.name}</span></span>
            <span className="font-num text-sm">{formatMoney(invoice.amount,{currency:invoice.currency})}</span>
            <span className="rounded-full bg-navy-50 px-3 py-2 text-xs text-quiet dark:bg-navy-800">{invoice.paidOn?'Zaplacená':'Čeká na platbu'}</span>
          </Link>
        </li>)}
      </ul>}
    </section>
  </div>
}

function InvoiceRow({invoice,slug,today,href,filter}:{invoice:Invoice;slug:string;today:string;href:string;filter:InvoiceFilter}) {
  const {run,pending}=useWsAction()
  const overdue=!invoice.paidOn&&invoice.dueOn<today
  const state=invoice.paidOn?'Zaplacená':overdue?'Po splatnosti':'Čeká na platbu'
  return <li className="flex flex-wrap items-center gap-2 py-2">
    <Link href={href} className="flex min-h-16 min-w-0 flex-1 flex-wrap items-center gap-2 py-2">
      <span className="min-w-0 flex-1"><span className="font-num text-sm">{invoice.number||'Bez čísla'}</span><span className="block truncate text-sm text-quiet">{invoice.counterparty.name}{invoice.dueOn?' · splatnost '+formatDayShort(invoice.dueOn):''}</span></span>
      <span className="font-num text-sm">{formatMoney(invoice.amount,{currency:invoice.currency})}</span>
      <span className={'rounded-full px-3 py-2 text-xs '+(overdue?'bg-danger/10 text-danger':'bg-navy-50 text-quiet dark:bg-navy-800')}>{state}</span>
    </Link>
    {filter!=='paid'&&!invoice.paidOn&&<Button variant="outline" disabled={pending} onClick={()=>void run(
      ()=>payInvoiceAction({slug,id:invoice.id,day:today,method:'transfer'}),
      ()=>undoToast('Faktura je zaplacená.',()=>undoInvoicePaymentAction({slug,id:invoice.id}),{done:'Platba byla vrácená.'}),
    )}>Zaplaceno</Button>}
  </li>
}
