import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AccentHeading } from '@/components/ws/brand'
import { DetailSheet } from '@/components/ws/app/detail-sheet'
import { HelpLink } from '@/components/ws/app/help-link'
import { buttonVariants } from '@/components/ui/button'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { MetricsSkeleton,TaxSkeleton } from '@/components/ws/app/skeletons'
import { requireBusiness,requireWorkspace } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { hrefWith } from '@/lib/ws/detail-param'
import { pragueToday,formatDayShort } from '@/lib/ws/time'
import { formatMoney } from '@/lib/ws/money'
import { currencyTotals,estimateTax,monthSeries,RATES } from '@/lib/ws/money/calculations'
import { getFinance,getInvoice,getInvoiceOptions,getMoneyTotals,getOverdueInvoiceCount,getTaxSettings,listInvoices,monthMetrics,type FinanceEntry } from '@/lib/ws/money/data'
import { aiConfigured } from '@/lib/ws/money/ai'
import { moneyDeadlines } from '@/lib/ws/money/reminders'
import { plural } from '@/lib/ws/plural'
import { InvoiceForm,InvoicePayment } from './invoice-form'
import { InvoiceList } from './invoice-list'
import { ReceivedForm,TaxForm,TransactionForm } from './forms'
import { MoneyChart } from './chart'

type Params=Record<string,string|string[]|undefined>
type Section='faktury'|'prijmy'|'dane'|'penize'
const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v
const panel='rounded-panel border bg-surface p-5 sm:p-6'
const SOURCE:Record<string,string>={web:'Web',page:'Objednávací stránka',widget:'Widget',manual:'Ručně',phone:'Telefon',eshop:'E-shop'}
const SEGMENT:Record<string,string>={new:'Noví',regular:'Stálí',one_time:'Jednorázoví',dormant:'Spící',ended:'Ukončení',unassigned:'Bez skupiny'}
function monthOffset(month:string,offset:number) {const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,10)}
function group(entries:FinanceEntry[],key:'segment'|'service'|'source') {
 const groups=new Map<string,FinanceEntry[]>()
 for(const t of entries.filter(t=>t.kind==='income')){const k=t[key];groups.set(k,[...(groups.get(k)??[]),t])}
 return Array.from(groups).map(([name,values])=>({name,totals:currencyTotals(values)}))
}
function Totals({entries}:{entries:FinanceEntry[]}) {
 const totals=currencyTotals(entries)
 return <div className="grid gap-3 sm:grid-cols-3">{(['income','expense','balance'] as const).map(k=><div key={k} className={panel}>
 <h2 className="text-sm text-quiet">{{income:'Příjmy',expense:'Výdaje',balance:'Rozdíl'}[k]}</h2>
 {Object.keys(totals).length?Object.entries(totals).map(([currency,v])=><p data-ws-private-value key={currency} className="mt-2 font-num text-xl">{formatMoney(v[k],{currency:currency as 'CZK'|'EUR'})}</p>):<p className="mt-2 text-sm text-quiet">Zatím bez plateb</p>}</div>)}</div>
}
export async function MoneyPage({slug,section,searchParams}:{slug:string;section:Section;searchParams:Params}) {
 const ctx=await requireWorkspace(),business=await requireBusiness(ctx,slug),modules=await getEnabledModules(ctx,business)
 const module=section==='faktury'?'invoices':section==='dane'?'taxes':'finance'
 if(!modules.has(module))notFound()
 const today=pragueToday(),currentMonth=today.slice(0,7)
 const requested=one(searchParams.mesic),month=requested&&/^\d{4}-(0[1-9]|1[0-2])$/.test(requested)&&Number(requested.slice(0,4))>=2020&&Number(requested.slice(0,4))<=2100?requested:currentMonth
 const year=Number(month.slice(0,4)),all=one(searchParams.rozsah)==='ucet',pathname='/w/'+slug+'/'+section
 const link=(patch:Record<string,string|null>)=>hrefWith(pathname,searchParams,patch)
 const from=monthOffset(month,0),next=monthOffset(month,1),end=new Date(new Date(next).getTime()-86400000).toISOString().slice(0,10)
 // Řádky jen za zvolený měsíc (seznam plateb, rozpady); starší měsíce pro graf a srovnání jdou jako součty z SQL (RD03).
 const taxYearRange=section==='penize'&&modules.has('taxes')?getMoneyTotals(ctx,business,year+'-01-01',year+'-12-31',true):Promise.resolve([])
 const overdueCount=section==='penize'&&modules.has('invoices')?getOverdueInvoiceCount(ctx,business,today,all):Promise.resolve(null)
 const [current,series,invoices,tax,taxYearRows,overdue]=await Promise.all([getFinance(ctx,business,from,end,all),getMoneyTotals(ctx,business,monthOffset(month,-11),end,all),section==='faktury'?listInvoices(ctx,business,all):[],getTaxSettings(ctx),taxYearRange,overdueCount])
 const previous=series.filter(t=>t.day>=monthOffset(month,-1)&&t.day<from)
 const detail=one(searchParams.detail),id=detail?.startsWith('faktura:')?detail.slice(8):null
 const invoiceFilter=one(searchParams.stav)==='paid'?'paid':one(searchParams.stav)==='overdue'?'overdue':'open'
 const invoice=id&&/^[0-9a-f-]{36}$/i.test(id)?await getInvoice(ctx,business,id):null
 const closeHref=link({detail:null,zakazka:null})
 const count=one(searchParams.obdobi)==='6'?6:12
 const tabs=[['penize','Přehled','finance'],['faktury','Faktury','invoices'],['prijmy','Rozbory','finance'],['dane','Daně','taxes']]
 const yearTotals=currencyTotals(taxYearRows).CZK??{income:0,expense:0,balance:0}
 const taxEstimate=taxYearRows.some(entry=>entry.currency!=='CZK')||tax.vatPayer?null:estimateTax(yearTotals.income,yearTotals.expense,tax,year)
 const action=section==='faktury'?{detail:'nova-faktura'}:section==='dane'?{detail:'dane-nastaveni'}:{detail:'nova-platba'}
 return <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
 <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><AccentHeading accent="pod kontrolou.">Peníze </AccentHeading><HelpLink slug={slug} topic="faktury-a-penize" guide={section==='faktury'?'vystavit-fakturu':section==='dane'?'nastavit-dane':'zapsat-platbu'} /></div>
 <Link href={link(action)} className={buttonVariants({variant:section==='dane'?'outline':'primary'})}>{section==='faktury'?'Vystavit fakturu':section==='dane'?'Nastavit daně':'Zapsat platbu'}</Link></div>
 <nav className="flex flex-wrap gap-2" aria-label="Peníze">
  {tabs.filter(tab=>modules.has(tab[2])).map(tab=><Link key={tab[0]}
   href={hrefWith('/w/'+slug+'/'+tab[0],{mesic:month,rozsah:all?'ucet':undefined},{})}
   aria-current={section===tab[0]?'page':undefined}
   className={buttonVariants({variant:section===tab[0]?'outline':'ghost'})}>{tab[1]}</Link>)}
 </nav>
 <div className="flex flex-wrap items-center gap-2">
  <Link className={buttonVariants({variant:all?'ghost':'outline'})} href={link({rozsah:null})}>{business.name}</Link>
  <Link className={buttonVariants({variant:all?'outline':'ghost'})} href={link({rozsah:'ucet'})}>Vše · jedno IČO</Link>
  <form className="ml-auto flex items-center gap-2" action={pathname}>
   <label className="sr-only" htmlFor="money-month">Měsíc</label>
   <input id="money-month" type="month" name="mesic" defaultValue={month} min="2020-01" max="2100-12"
    className="min-h-11 rounded-full border bg-surface px-3 font-num text-sm"/>
   {all&&<input type="hidden" name="rozsah" value="ucet"/>}
   <button className={buttonVariants({variant:'outline'})}>Zobrazit</button>
  </form>
 </div>
 {section==='faktury'?<>
 <Link href={link({detail:'prijata-faktura'})} className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 dark:text-navy-200">Přidat přijatou fakturu</Link>
 <InvoiceList slug={slug} invoices={invoices} today={today} filter={invoiceFilter} all={all}/>
 </>:section==='dane'?<Suspense fallback={<TaxSkeleton/>}><TaxPanel ctx={ctx} business={business} year={year} today={today} settings={tax}/></Suspense>:<>
 <Totals entries={current}/>
 {section==='penize'&&<>
  {(taxEstimate||overdue!==null)&&<div className="grid gap-3 sm:grid-cols-2">
   {taxEstimate&&<Link href={hrefWith('/w/'+slug+'/dane',{mesic:month,rozsah:all?'ucet':undefined},{})} className={panel}>
    <p className="text-sm text-quiet">Odložit na daně</p>
    <p data-ws-private-value className="mt-2 font-num text-xl">{formatMoney(taxEstimate.monthly)} měsíčně</p>
    <p data-ws-private-value className="mt-1 text-sm text-quiet">Odhad za {year}: {formatMoney(taxEstimate.remaining)} zbývá po zálohách</p>
   </Link>}
   {overdue!==null&&<Link href={hrefWith('/w/'+slug+'/faktury',{stav:'overdue',rozsah:all?'ucet':undefined},{})} className={panel}>
    <p className="text-sm text-quiet">Po splatnosti</p>
    <p className="mt-2 font-num text-xl">{plural(overdue,['faktura','faktury','faktur'])}</p>
    <p className="mt-1 text-sm text-quiet">Otevřít faktury po splatnosti</p>
   </Link>}
  </div>}
  <section className={panel}>
   <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
    <h2 className="text-lg font-semibold">Příjmy a výdaje</h2>
    <div className="flex gap-2">{[6,12].map(months=><Link key={months} href={link({obdobi:String(months)})}
     className={buttonVariants({variant:count===months?'outline':'ghost'})}>{months} měsíců</Link>)}</div>
   </div>
   <MoneyChart rows={monthSeries(series,month,count)}/>
  </section>
  <section className={panel}>
   <h2 className="text-lg font-semibold">Oproti minulému měsíci</h2>
   {Object.entries(currencyTotals(current)).map(([currency,value])=>{
    const previousIncome=currencyTotals(previous)[currency]?.income??0
    const percent=previousIncome>0?' ('+Math.round((value.income-previousIncome)/previousIncome*100)+' %)':''
    return <p data-ws-private-value key={currency} className="mt-2 font-num">{currency}: {formatMoney(value.income-previousIncome,{currency:currency as 'CZK'|'EUR'})}{percent}</p>
   })}
  </section>
  <Suspense fallback={<MetricsSkeleton/>}><MonthMetrics ctx={ctx} business={business} from={from} end={end} all={all}/></Suspense>
  {modules.has('taxes')&&<Suspense fallback={<TaxSkeleton/>}><TaxPanel ctx={ctx} business={business} year={year} today={today} settings={tax}/></Suspense>}
 </>}
 {section==='prijmy'&&<>
  <div className="grid gap-4 lg:grid-cols-3">
   {(['segment','service','source'] as const).map(key=>{
    const title={segment:'Podle skupin',service:'Podle služeb',source:'Podle zdroje'}[key]
    const values=group(current,key)
    return <section key={key} className={panel}>
     <h2 className="mb-3 text-lg font-semibold">{title}</h2>
     {values.length===0?<p className="text-sm text-quiet">Zatím bez příjmů.</p>:values.map(value=><div key={value.name} className="border-t py-3 text-sm">
      <p>{key==='source'?SOURCE[value.name]??value.name:key==='segment'?SEGMENT[value.name]??value.name:value.name}</p>
      {Object.entries(value.totals).map(([currency,total])=><p data-ws-private-value key={currency} className="font-num">{formatMoney(total.income,{currency:currency as 'CZK'|'EUR'})}</p>)}
     </div>)}
    </section>
   })}
  </div>
  <section className={panel}>
   <h2 className="mb-3 text-lg font-semibold">Platby za měsíc</h2>
   {current.length===0?<p className="text-quiet">Zapište první platbu. Faktura se tu objeví až po zaplacení.</p>:<ul className="divide-y">
    {current.map(transaction=><li key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
     <div><p className="text-sm">{transaction.description||transaction.category}</p>
      <p className="font-num text-xs text-quiet">{formatDayShort(transaction.day)} · {transaction.kind==='income'?'Příjem':'Výdaj'} · {transaction.category}</p></div>
     <span data-ws-private-value className="font-num text-sm">{transaction.kind==='expense'?'−':''}{formatMoney(transaction.amount,{currency:transaction.currency})}</span>
    </li>)}
   </ul>}
  </section>
 </>}
 </>}
 {invoice&&<DetailSheet title={'Faktura '+invoice.number} closeHref={closeHref}>
  <p data-ws-private-value className="mb-2 text-quiet">{invoice.counterparty.name}</p>
  <p data-ws-private-value className="mb-6 font-num text-2xl">{formatMoney(invoice.amount,{currency:invoice.currency})}</p>
  <InvoicePayment slug={slug} invoice={invoice} today={today}/>
 </DetailSheet>}
 {id&&!invoice&&<DetailSheet title="Faktura tu není" closeHref={closeHref}><p className="text-quiet">Zkontrolujte vybraný byznys a číslo faktury.</p></DetailSheet>}
 {detail==='nova-faktura'&&modules.has('invoices')&&<DetailSheet title="Nová faktura" closeHref={closeHref}>
  <InvoiceForm slug={slug} today={today} options={await getInvoiceOptions(ctx,business)} closeHref={closeHref} jobId={one(searchParams.zakazka)} customerId={one(searchParams.zakaznik)}/>
 </DetailSheet>}
 {detail==='prijata-faktura'&&modules.has('invoices')&&<DetailSheet title="Přijatá faktura" closeHref={closeHref}><ReceivedForm slug={slug} today={today} closeHref={closeHref} ai={aiConfigured()}/></DetailSheet>}
 {detail==='nova-platba'&&modules.has('finance')&&<DetailSheet title="Zapsat platbu" closeHref={closeHref}><TransactionForm slug={slug} today={today} closeHref={closeHref}/></DetailSheet>}
 {detail==='dane-nastaveni'&&modules.has('taxes')&&ctx.role==='owner'&&<DetailSheet title="Daňové nastavení" closeHref={closeHref}><TaxForm slug={slug} settings={tax}/></DetailSheet>}
 {!['nova-faktura','prijata-faktura','nova-platba','dane-nastaveni'].includes(detail??'')&&!id&&<DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today}/>}
 </div>
}
async function MonthMetrics({ctx,business,from,end,all}:{ctx:Parameters<typeof monthMetrics>[0];business:Parameters<typeof monthMetrics>[1];from:string;end:string;all:boolean}) {
 const m=await monthMetrics(ctx,business,from,end,all)
 const values=[['Poptávky',m.requests],['Přišlo z webu',m.online],['Zákazníci s poptávkou',m.customers] as const]
 return <div className="grid gap-3 sm:grid-cols-3">
  {values.map(([label,value])=><div key={label} className={panel}>
   <p className="text-sm text-quiet">{label}</p><p className="mt-2 font-num text-2xl">{value}</p>
  </div>)}
 </div>
}
async function TaxPanel({ctx,business,year,today,settings}:{
 ctx:Parameters<typeof getFinance>[0]
 business:Parameters<typeof getFinance>[1] & {slug:string}
 year:number
 today:string
 settings:Awaited<ReturnType<typeof getTaxSettings>>
}) {
 // Daň a DPH vždy za celý účet. Pohled jednoho byznysu nesmí zkrátit obrat.
 // Jen součty ze SQL, bez řádků plateb (RD03); dva dotazy běží zároveň.
 const [entries,trailing]=await Promise.all([
  getMoneyTotals(ctx,business,year+'-01-01',year+'-12-31',true),
  getMoneyTotals(ctx,business,monthOffset(today.slice(0,7),-11),today,true),
 ])
 const czk=currencyTotals(entries).CZK??{income:0,expense:0,balance:0}
 const foreign=entries.some(entry=>entry.currency!=='CZK')
 const estimate=foreign||settings.vatPayer?null:estimateTax(czk.income,czk.expense,settings,year)
 const annualProjection=czk.income/Math.max(1,Number(today.slice(5,7)))*12
 const deadlines=moneyDeadlines(today,settings).slice(0,3)
 return <section className={panel}>
  <h2 className="text-lg font-semibold">Daně za {year} · celé IČO</h2>
  <p className="mt-2 text-sm text-quiet">Odhad, ne daňové poradenství. Z placených příjmů evidovaných v účtu. Nezahrnuje příjmy mimo tuto aplikaci.</p>
  {estimate&&<p className="mt-4 text-base font-semibold">Za {year} odhadujeme <span data-ws-private-value className="font-num">{formatMoney(estimate.total)}</span>; odkládejte <span data-ws-private-value className="font-num">{formatMoney(estimate.monthly)}</span> měsíčně.</p>}
  {estimate?<div className="my-5 grid gap-4 sm:grid-cols-3">
   <div><p className="text-sm text-quiet">Daně a pojistné za rok</p><p data-ws-private-value className="mt-1 font-num text-2xl">{formatMoney(estimate.total)}</p></div>
   <div><p className="text-sm text-quiet">Zbývá odložit po uhrazených zálohách</p><p data-ws-private-value className="mt-1 font-num text-2xl">{formatMoney(estimate.remaining)}</p></div>
   <div><p className="text-sm text-quiet">Průměr na měsíc činnosti</p><p data-ws-private-value className="mt-1 font-num text-2xl">{formatMoney(estimate.monthly)}</p></div>
  </div>:<p className="my-5 text-sm text-quiet">{foreign
   ?'Odhad nezobrazujeme: příjmy nebo výdaje v cizí měně potřebují převod kurzem.'
   :settings.vatPayer?'Odhad pro plátce DPH zatím není dostupný.':'Pro tento rok zatím nemáme ověřené sazby.'}</p>}
 {estimate&&estimate.tax!==null&&<p data-ws-private-value className="text-sm text-quiet">Daň {formatMoney(estimate.tax)} · Sociální {formatMoney(estimate.social??0)} · Zdravotní {formatMoney(estimate.health??0)}</p>}
  <div className="mt-5 border-t pt-4">
   <h3 className="font-semibold">Hlídání DPH</h3>
   <p className="mt-2 text-sm">Přijaté příjmy v CZK za kalendářní rok: <span data-ws-private-value className="font-num">{formatMoney(czk.income)}</span>.</p>
   <p className="mt-2 text-sm text-quiet">Přijaté příjmy jsou orientační vodítko. Zákonný obrat DPH se počítá z uskutečněných plnění v tuzemsku a nemusí odpovídat platbám. Zkontrolujte ho s účetní.</p>
   <div className="mt-4" aria-label={`Příjmy dosahují ${Math.min(100,Math.round(czk.income/RATES.vatLimit*100))} procent první hranice DPH`}>
    <div className="mb-1 flex justify-between gap-2 text-xs text-quiet"><span>První hranice</span><span className="font-num">{Math.min(100,Math.round(czk.income/RATES.vatLimit*100))} %</span></div>
    <div role="progressbar" aria-label="Přijaté příjmy vůči první hranici DPH" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.round(czk.income/RATES.vatLimit*100))} className="h-2 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
     <div className="h-full rounded-full bg-navy-700 transition-[width] motion-reduce:transition-none dark:bg-navy-300" style={{width:`${Math.min(100,Math.round(czk.income/RATES.vatLimit*100))}%`}}/>
    </div>
   </div>
   <p data-ws-private-value className="mt-2 font-num text-sm">Hranice {formatMoney(RATES.vatLimit)} a {formatMoney(RATES.vatImmediate)}</p>
   {!foreign&&year===Number(today.slice(0,4))&&<p className="mt-2 text-sm text-quiet">
    Výhled příjmů při stejném tempu: <span data-ws-private-value className="font-num">{formatMoney(annualProjection)}</span>.
    Posledních 12 měsíců: <span data-ws-private-value className="font-num">{formatMoney(currencyTotals(trailing).CZK?.income??0)}</span>.
   </p>}
   {czk.income>RATES.vatLimit&&<p className="mt-2 text-sm font-semibold text-danger">Příjmy překročily hranici DPH. Ověřte skutečný obrat a registrační povinnost s účetní.</p>}
   <a href="https://app.fs.gov.cz/dotazy-verejnosti/dotaz/termin-pro-podani-prihlasky-k-registraci-platce-dph-1493" className="inline-flex min-h-11 items-center text-sm text-navy-700 underline dark:text-navy-200">Pravidla Finanční správy</a>
  </div>
  <div className="mt-4 border-t pt-4">
   <h3 className="font-semibold">Nejbližší termíny</h3>
   {deadlines.map(deadline=><p key={deadline.id} className="mt-2 text-sm">
    <a href={deadline.sourceUrl} className="underline">{deadline.title}</a> · <span className="font-num">{formatDayShort(deadline.date)}</span>
   </p>)}
   <p className="mt-2 text-sm text-quiet">Přidáním do kalendáře získáte připomínku 7 dní předem. Termíny přehledů závisí i na skutečném podání přiznání.</p>
   <a href={'/api/ws/'+business.slug+'/dane/kalendar'} className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 dark:text-navy-200">Přidat termíny do kalendáře</a>
  </div>
 <p className="mt-5 text-xs text-quiet">Sazby {RATES.year}, ověřeno 10. 10. 2026. Snížená minima začínající OSVČ, souběh zaměstnání a jiná zvýhodnění nejsou zahrnuté.</p>
 </section>
}
