import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AccentHeading } from '@/components/ws/brand'
import { DetailSheet } from '@/components/ws/app/detail-sheet'
import { buttonVariants } from '@/components/ui/button'
import { DetailSlot } from '@/components/ws/app/detail-slot'
import { requireBusiness,requireWorkspace } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { hrefWith } from '@/lib/ws/detail-param'
import { pragueToday,formatDayShort } from '@/lib/ws/time'
import { formatMoney } from '@/lib/ws/money'
import { currencyTotals,estimateTax,monthSeries,RATES } from '@/lib/ws/money/calculations'
import { getFinance,getInvoice,getInvoiceOptions,getTaxSettings,listInvoices,monthMetrics,type FinanceEntry } from '@/lib/ws/money/data'
import { wsDb } from '@/lib/ws/db'
import { aiConfigured } from '@/lib/ws/money/ai'
import { moneyDeadlines } from '@/lib/ws/money/reminders'
import { InvoiceForm,InvoicePayment,ReceivedForm,TaxForm,TransactionForm } from './forms'
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
 {Object.keys(totals).length?Object.entries(totals).map(([currency,v])=><p key={currency} className="mt-2 font-num text-xl">{formatMoney(v[k],{currency:currency as 'CZK'|'EUR'})}</p>):<p className="mt-2 text-sm text-quiet">Zatím bez plateb</p>}</div>)}</div>
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
 const [entries,invoices,tax,businesses]=await Promise.all([getFinance(ctx,business,monthOffset(month,-11),end,all),section==='faktury'?listInvoices(ctx,business,all):[],getTaxSettings(ctx),wsDb(ctx)<{id:string;name:string;slug:string}>`SELECT id,name,slug FROM ws.businesses WHERE account_id=${ctx.accountId} AND archived_at IS NULL`])
 const current=entries.filter(t=>t.day>=from&&t.day<=end),previous=entries.filter(t=>t.day>=monthOffset(month,-1)&&t.day<from)
 const detail=one(searchParams.detail),id=detail?.startsWith('faktura:')?detail.slice(8):null
 const invoice=id&&/^[0-9a-f-]{36}$/i.test(id)?await getInvoice(ctx,business,id):null
 const closeHref=link({detail:null,zakazka:null})
 const count=one(searchParams.obdobi)==='6'?6:12
 const tabs=[['penize','Přehled měsíce','finance'],['faktury','Faktury','invoices'],['prijmy','Příjmy a výdaje','finance'],['dane','Daně','taxes']]
 const action=section==='faktury'?{detail:'nova-faktura'}:section==='dane'?{detail:'dane-nastaveni'}:{detail:'nova-platba'}
 return <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
 <div className="flex flex-wrap items-center justify-between gap-3"><AccentHeading accent="pod kontrolou.">Peníze </AccentHeading>
 <Link href={link(action)} className={buttonVariants({variant:section==='dane'?'outline':'primary'})}>{section==='faktury'?'Vystavit fakturu':section==='dane'?'Nastavit daně':'Zapsat platbu'}</Link></div>
 <nav className="flex flex-wrap gap-2" aria-label="Peníze">{tabs.filter(t=>modules.has(t[2])).map(t=><Link key={t[0]} href={hrefWith('/w/'+slug+'/'+t[0],{mesic:month,rozsah:all?'ucet':undefined},{})} aria-current={section===t[0]?'page':undefined} className={buttonVariants({variant:section===t[0]?'outline':'ghost'})}>{t[1]}</Link>)}</nav>
 <div className="flex flex-wrap items-center gap-2"><Link className={buttonVariants({variant:all?'ghost':'outline'})} href={link({rozsah:null})}>{business.name}</Link><Link className={buttonVariants({variant:all?'outline':'ghost'})} href={link({rozsah:'ucet'})}>Vše · jedno IČO</Link>
 <form className="ml-auto flex items-center gap-2" action={pathname}><label className="sr-only" htmlFor="money-month">Měsíc</label><input id="money-month" type="month" name="mesic" defaultValue={month} min="2020-01" max="2100-12" className="min-h-11 rounded-full border bg-surface px-3 font-num text-sm"/>{all&&<input type="hidden" name="rozsah" value="ucet"/>}<button className={buttonVariants({variant:'outline'})}>Zobrazit</button></form></div>
 {section==='faktury'?<>
 <Link href={link({detail:'prijata-faktura'})} className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 dark:text-navy-200">Přidat přijatou fakturu</Link>
 <div className={panel}><h2 className="mb-4 text-lg font-semibold">Faktury</h2>{invoices.length===0?<p className="text-quiet">Vystavte první fakturu nebo přidejte přijatý doklad.</p>:<ul className="divide-y">{invoices.map(i=>{
 const b=businesses.find(b=>b.id===i.businessId),href=b?'/w/'+b.slug+'/faktury?detail=faktura:'+i.id:link({detail:'faktura:'+i.id})
 const overdue=!i.paidOn&&i.status!=='cancelled'&&i.dueOn&&i.dueOn<today
 return <li key={i.id}><Link href={href} className="flex min-h-16 flex-wrap items-center gap-2 py-3">
 <span className="min-w-0 flex-1"><span className="font-num text-sm">{i.number||'Bez čísla'}</span><span className="block truncate text-sm text-quiet">{i.counterparty.name} · {i.direction==='received'?'Přijatá':'Vystavená'}{all&&b?' · '+b.name:''}</span></span>
 <span className="font-num text-sm">{formatMoney(i.amount,{currency:i.currency})}</span><span className={'rounded-full px-3 py-2 text-xs '+(overdue?'bg-danger/10 text-danger':'bg-navy-50 text-quiet dark:bg-navy-800')}>{i.paidOn?'Zaplacená':i.status==='cancelled'?'Stornovaná':overdue?'Po splatnosti':'Čeká na platbu'}</span>
 </Link></li>})}</ul>}{invoices.length===500&&<p className="mt-4 text-sm text-quiet">Zobrazeno posledních 500 faktur. Starší najdete hledáním podle čísla.</p>}</div>
 </>:section==='dane'?await TaxPanel({ctx,business,year,today,settings:tax}):<>
 <Totals entries={current}/>
 {section==='penize'&&<><section className={panel}><h2 className="text-lg font-semibold">Oproti minulému měsíci</h2>{Object.entries(currencyTotals(current)).map(([currency,v])=>{const p=currencyTotals(previous)[currency]?.income??0;return <p key={currency} className="mt-2 font-num">{currency}: {formatMoney(v.income-p,{currency:currency as 'CZK'|'EUR'})}{p>0?' ('+Math.round((v.income-p)/p*100)+' %)':''}</p>})}</section>
 {await MonthMetrics({ctx,business,from,end,all})}</>}
 <section className={panel}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Příjmy a výdaje</h2><div className="flex gap-2">{[6,12].map(n=><Link key={n} href={link({obdobi:String(n)})} className={buttonVariants({variant:count===n?'outline':'ghost'})}>{n} měsíců</Link>)}</div></div><MoneyChart rows={monthSeries(entries,month,count)}/></section>
 <div className="grid gap-4 lg:grid-cols-3">{(['segment','service','source'] as const).map(key=><section key={key} className={panel}><h2 className="mb-3 text-lg font-semibold">{{segment:'Podle skupin',service:'Podle služeb',source:'Podle zdroje'}[key]}</h2>
 {group(current,key).length===0?<p className="text-sm text-quiet">Zatím bez příjmů.</p>:group(current,key).map(g=><div key={g.name} className="border-t py-3 text-sm"><p>{key==='source'?SOURCE[g.name]??g.name:key==='segment'?SEGMENT[g.name]??g.name:g.name}</p>{Object.entries(g.totals).map(([c,v])=><p key={c} className="font-num">{formatMoney(v.income,{currency:c as 'CZK'|'EUR'})}</p>)}</div>)}</section>)}</div>
 <section className={panel}><h2 className="mb-3 text-lg font-semibold">Platby za měsíc</h2>{current.length===0?<p className="text-quiet">Zapište první platbu. Faktura se tu objeví až po zaplacení.</p>:<ul className="divide-y">{current.map(t=><li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm">{t.description||t.category}</p><p className="font-num text-xs text-quiet">{formatDayShort(t.day)} · {t.kind==='income'?'Příjem':'Výdaj'} · {t.category}</p></div><span className="font-num text-sm">{t.kind==='expense'?'−':''}{formatMoney(t.amount,{currency:t.currency})}</span></li>)}</ul>}</section>
 {section==='penize'&&modules.has('taxes')&&await TaxPanel({ctx,business,year,today,settings:tax})}
 </>}
 {invoice&&<DetailSheet title={'Faktura '+invoice.number} closeHref={closeHref}><p className="mb-2 text-quiet">{invoice.counterparty.name}</p><p className="mb-6 font-num text-2xl">{formatMoney(invoice.amount,{currency:invoice.currency})}</p><InvoicePayment slug={slug} invoice={invoice} today={today}/></DetailSheet>}
 {id&&!invoice&&<DetailSheet title="Faktura tu není" closeHref={closeHref}><p className="text-quiet">Zkontrolujte vybraný byznys a číslo faktury.</p></DetailSheet>}
 {detail==='nova-faktura'&&modules.has('invoices')&&<DetailSheet title="Nová faktura" closeHref={closeHref}><InvoiceForm slug={slug} today={today} options={await getInvoiceOptions(ctx,business)} closeHref={closeHref} jobId={one(searchParams.zakazka)}/></DetailSheet>}
 {detail==='prijata-faktura'&&modules.has('invoices')&&<DetailSheet title="Přijatá faktura" closeHref={closeHref}><ReceivedForm slug={slug} today={today} closeHref={closeHref} ai={aiConfigured()}/></DetailSheet>}
 {detail==='nova-platba'&&modules.has('finance')&&<DetailSheet title="Zapsat platbu" closeHref={closeHref}><TransactionForm slug={slug} today={today} closeHref={closeHref}/></DetailSheet>}
 {detail==='dane-nastaveni'&&modules.has('taxes')&&ctx.role==='owner'&&<DetailSheet title="Daňové nastavení" closeHref={closeHref}><TaxForm slug={slug} settings={tax}/></DetailSheet>}
 {!['nova-faktura','prijata-faktura','nova-platba','dane-nastaveni'].includes(detail??'')&&!id&&<DetailSlot ctx={ctx} business={business} pathname={pathname} searchParams={searchParams} today={today}/>}
 </div>
}
async function MonthMetrics({ctx,business,from,end,all}:{ctx:Parameters<typeof monthMetrics>[0];business:Parameters<typeof monthMetrics>[1];from:string;end:string;all:boolean}) {
 const m=await monthMetrics(ctx,business,from,end,all)
 return <div className="grid gap-3 sm:grid-cols-3">{([['Poptávky',m.requests],['Přišlo z webu',m.online],['Zákazníci s poptávkou',m.customers]] as const).map(([label,value])=><div key={label} className={panel}><p className="text-sm text-quiet">{label}</p><p className="mt-2 font-num text-2xl">{value}</p></div>)}</div>
}
async function TaxPanel({ctx,business,year,today,settings}:{ctx:Parameters<typeof getFinance>[0];business:Parameters<typeof getFinance>[1] & {slug:string};year:number;today:string;settings:Awaited<ReturnType<typeof getTaxSettings>>}) {
 // Daň a DPH vždy za celý účet. Pohled jednoho byznysu nesmí zkrátit obrat.
 const entries=await getFinance(ctx,business,year+'-01-01',year+'-12-31',true)
 const czk=currencyTotals(entries).CZK??{income:0,expense:0,balance:0}
 const foreign=entries.some(e=>e.currency!=='CZK'),estimate=foreign||settings.vatPayer?null:estimateTax(czk.income,czk.expense,settings,year)
 const trailing=await getFinance(ctx,business,monthOffset(today.slice(0,7),-11),today,true)
 const annualProjection=czk.income/Math.max(1,Number(today.slice(5,7)))*12
 const deadlines=moneyDeadlines(today,settings).slice(0,3)
 return <section className={panel}><h2 className="text-lg font-semibold">Daně za {year} · celé IČO</h2><p className="mt-2 text-sm text-quiet">Odhad, ne daňové poradenství. Z placených příjmů evidovaných v účtu. Nezahrnuje příjmy mimo tuto aplikaci.</p>
 {estimate?<div className="my-5 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-quiet">Daně a pojistné za rok</p><p className="mt-1 font-num text-2xl">{formatMoney(estimate.total)}</p></div><div><p className="text-sm text-quiet">Zbývá odložit po uhrazených zálohách</p><p className="mt-1 font-num text-2xl">{formatMoney(estimate.remaining)}</p></div><div><p className="text-sm text-quiet">Průměr na měsíc činnosti</p><p className="mt-1 font-num text-2xl">{formatMoney(estimate.monthly)}</p></div></div>:<p className="my-5 text-sm text-quiet">{foreign?'Odhad nezobrazujeme: příjmy nebo výdaje v cizí měně potřebují převod kurzem.':settings.vatPayer?'Odhad pro plátce DPH zatím není dostupný.': 'Pro tento rok zatím nemáme ověřené sazby.'}</p>}
 {estimate&&estimate.tax!==null&&<p className="text-sm text-quiet">Daň {formatMoney(estimate.tax)} · Sociální {formatMoney(estimate.social??0)} · Zdravotní {formatMoney(estimate.health??0)}</p>}
 <div className="mt-5 border-t pt-4"><h3 className="font-semibold">Hlídání DPH</h3><p className="mt-2 text-sm">Přijaté příjmy v CZK za kalendářní rok: <span className="font-num">{formatMoney(czk.income)}</span>.</p>
 <p className="mt-2 text-sm text-quiet">Přijaté příjmy jsou orientační vodítko. Zákonný obrat DPH se počítá z uskutečněných plnění v tuzemsku a nemusí odpovídat platbám. Zkontrolujte ho s účetní.</p>
 <p className="mt-2 font-num text-sm">Hranice {formatMoney(RATES.vatLimit)} a {formatMoney(RATES.vatImmediate)}</p>
 {!foreign&&year===Number(today.slice(0,4))&&<p className="mt-2 text-sm text-quiet">Výhled příjmů při stejném tempu: <span className="font-num">{formatMoney(annualProjection)}</span>. Posledních 12 měsíců: <span className="font-num">{formatMoney(currencyTotals(trailing).CZK?.income??0)}</span>.</p>}
 {czk.income>RATES.vatLimit&&<p className="mt-2 text-sm font-semibold text-danger">Příjmy překročily hranici DPH. Ověřte skutečný obrat a registrační povinnost s účetní.</p>}
 <a href="https://app.fs.gov.cz/dotazy-verejnosti/dotaz/termin-pro-podani-prihlasky-k-registraci-platce-dph-1493" className="inline-flex min-h-11 items-center text-sm text-navy-700 underline dark:text-navy-200">Pravidla Finanční správy</a></div>
 <div className="mt-4 border-t pt-4"><h3 className="font-semibold">Nejbližší termíny</h3>{deadlines.map(d=><p key={d.id} className="mt-2 text-sm"><a href={d.sourceUrl} className="underline">{d.title}</a> · <span className="font-num">{formatDayShort(d.date)}</span></p>)}<p className="mt-2 text-sm text-quiet">Přidáním do kalendáře získáte připomínku 7 dní předem. Termíny přehledů závisí i na skutečném podání přiznání.</p><a href={'/api/ws/'+business.slug+'/dane/kalendar'} className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 dark:text-navy-200">Přidat termíny do kalendáře</a></div>
 <p className="mt-5 text-xs text-quiet">Sazby {RATES.year}, ověřeno 10. 10. 2026. Snížená minima začínající OSVČ, souběh zaměstnání a jiná zvýhodnění nejsou zahrnuté.</p>
 </section>
}
