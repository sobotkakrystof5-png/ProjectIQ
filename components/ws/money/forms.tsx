'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useWsAction } from '@/components/ws/app/booking/use-ws-action'
import { addTransactionAction,extractInvoiceAction,importInvoiceAction,issueInvoiceAction,payInvoiceAction,queueInvoiceAction,saveTaxAction } from '@/app/w/[business]/faktury/actions'
import type { getInvoiceOptions,Invoice } from '@/lib/ws/money/data'
import type { InvoiceItem,Party,TaxSettings } from '@/lib/ws/money/schema'
import { DEFAULT_TAX } from '@/lib/ws/money/defaults'
import { invoiceTotal } from '@/lib/ws/money/calculations'
import { formatMoney } from '@/lib/ws/money'

const selectClass='min-h-11 w-full rounded-chip border bg-surface px-3 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const blankParty:Party={name:'',address:'',ico:'',dic:'',email:'',bank:''}
type Options=Awaited<ReturnType<typeof getInvoiceOptions>>
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="flex min-w-0 flex-col gap-1.5 text-sm text-quiet">{label}{children}</label>}
function PartyFields({title,value,onChange,seller=false}:{title:string;value:Party;onChange:(p:Party)=>void;seller?:boolean}) {
 return <fieldset className="grid grid-cols-2 gap-3 rounded-box border p-4"><legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
  {(['name','address','ico','dic','email',...(seller?['bank'] as const:[])] as (keyof Party)[]).map(key=><div key={key} className={key==='name'||key==='address'?'col-span-2':''}><Field label={({name:'Jméno nebo firma',address:'Adresa',ico:'IČO',dic:'DIČ',email:'E-mail',bank:'Bankovní účet'})[key]}>
   <Input required={key==='name'||key==='address'||(seller&&key==='ico')} type={key==='email'?'email':'text'} value={value[key]} maxLength={key==='address'?400:key==='email'?254:key==='ico'?8:160} onChange={e=>onChange({...value,[key]:e.target.value})}/>
  </Field></div>)}
 </fieldset>
}
export function InvoiceForm({slug,today,options,closeHref,jobId}:{slug:string;today:string;options:Options;closeHref:string;jobId?:string}) {
 const router=useRouter(),{run,pending}=useWsAction()
 const [issuer,setIssuer]=useState<Party>({...blankParty,name:options.account.name,ico:options.account.ico})
 const initialJob=options.jobs.find(j=>j.id===jobId),initialCustomer=options.customers.find(c=>c.id===initialJob?.customerId)
 const [buyer,setBuyer]=useState<Party>({...blankParty,name:initialCustomer?.name??'',email:initialCustomer?.email??''})
 const [customer,setCustomer]=useState<string|null>(initialCustomer?.id??null)
 const [job,setJob]=useState<string|null>(initialJob?.id??null),[currency,setCurrency]=useState<'CZK'|'EUR'>(initialJob?.currency==='EUR'?'EUR':'CZK')
 const [vat,setVat]=useState(false),[items,setItems]=useState<InvoiceItem[]>([{description:initialJob?.title??'',quantity:1,unitPrice:initialJob?.price??0,vatRate:0}])
 const chooseJob=(id:string)=>{
  const j=options.jobs.find(j=>j.id===id);setJob(j?.id??null)
  if(j){const c=options.customers.find(c=>c.id===j.customerId);setCustomer(c?.id??null);if(c)setBuyer({...blankParty,name:c.name,email:c.email})
   setCurrency(j.currency==='EUR'?'EUR':'CZK');setItems([{description:j.title,quantity:1,unitPrice:j.price??0,vatRate:0}])}
 }
 let total:number|null=null;try{total=invoiceTotal(items)}catch{total=null}
 return <form className="flex flex-col gap-5" onSubmit={e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget)
  void run(()=>issueInvoiceAction({slug,jobId:job,customerId:customer,issuer:{...issuer,vatPayer:vat},counterparty:buyer,
   issuedOn:fd.get('issuedOn'),suppliedOn:fd.get('suppliedOn'),dueOn:fd.get('dueOn'),currency,items,note:fd.get('note')}),
   r=>{toast.success('Faktura je vystavená.');router.push('/w/'+slug+'/faktury?detail=faktura:'+r.id)})
 }}>
 <Field label="Z hotové zakázky"><select className={selectClass} value={job??''} onChange={e=>chooseJob(e.target.value)}><option value="">Ručně</option>{options.jobs.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
 <PartyFields title="Dodavatel" value={issuer} onChange={setIssuer} seller/>
 <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={vat} onChange={e=>{setVat(e.target.checked);if(!e.target.checked)setItems(items.map(i=>({...i,vatRate:0})))}}/>Dodavatel je plátce DPH</label>
 <Field label="Vybrat zákazníka"><select className={selectClass} value={customer??''} disabled={Boolean(job)} onChange={e=>{const c=options.customers.find(c=>c.id===e.target.value);setCustomer(c?.id??null);setBuyer({...blankParty,name:c?.name??'',email:c?.email??''})}}><option value="">Jiný odběratel</option>{options.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
 <PartyFields title="Odběratel" value={buyer} onChange={setBuyer}/>
 <div className="grid grid-cols-2 gap-3"><Field label="Vystaveno"><Input type="date" name="issuedOn" defaultValue={today} required/></Field><Field label="Splatnost"><Input type="date" name="dueOn" defaultValue={today} required/></Field><Field label="Datum plnění"><Input type="date" name="suppliedOn" defaultValue={today} required/></Field><Field label="Měna"><select className={selectClass} value={currency} onChange={e=>setCurrency(e.target.value as 'CZK'|'EUR')}><option>CZK</option><option>EUR</option></select></Field></div>
 <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-sm font-semibold">Položky</legend>{items.map((item,n)=><div key={n} className="grid grid-cols-2 gap-3 rounded-box border p-3">
 <div className="col-span-2"><Field label="Popis"><Input required maxLength={200} value={item.description} onChange={e=>setItems(items.map((i,k)=>k===n?{...i,description:e.target.value}:i))}/></Field></div>
 <Field label="Počet"><Input type="number" min="0.001" max="100000" step="0.001" required value={item.quantity} onChange={e=>setItems(items.map((i,k)=>k===n?{...i,quantity:Number(e.target.value)}:i))}/></Field>
 <Field label={vat?'Cena bez DPH':'Cena za kus'}><Input type="number" min="0" max="9999999999.99" step=".01" required value={item.unitPrice} onChange={e=>setItems(items.map((i,k)=>k===n?{...i,unitPrice:Number(e.target.value)}:i))}/></Field>
 {vat&&<Field label="DPH"><select className={selectClass} value={item.vatRate} onChange={e=>setItems(items.map((i,k)=>k===n?{...i,vatRate:Number(e.target.value) as 0|12|21}:i))}>{[0,12,21].map(r=><option key={r} value={r}>{r} %</option>)}</select></Field>}
 {items.length>1&&<Button type="button" variant="ghost" onClick={()=>setItems(items.filter((_,k)=>k!==n))}>Odebrat položku</Button>}
 </div>)}</fieldset>
 {items.length<50&&<Button type="button" variant="outline" onClick={()=>setItems([...items,{description:'',quantity:1,unitPrice:0,vatRate:0}])}>Přidat položku</Button>}
 <p className="text-right font-num text-xl">{total===null?'Zkontrolujte částky':formatMoney(total,{currency})}</p>
 <Field label="Poznámka"><Input name="note" maxLength={2000}/></Field>
 <div className="flex items-center gap-3"><Button type="submit" disabled={pending||total===null}>Vystavit fakturu</Button><Link href={closeHref} className="inline-flex min-h-11 items-center text-sm text-quiet">Zpět</Link></div>
 </form>
}
export function InvoicePayment({slug,invoice,today}:{slug:string;invoice:Invoice;today:string}) {
 const {run,pending}=useWsAction()
 return <div className="flex flex-col gap-4">
 {invoice.direction==='issued'||invoice.hasPdf?<a className="inline-flex min-h-11 items-center font-semibold text-navy-700 dark:text-navy-200" href={'/api/ws/'+slug+'/faktury/'+invoice.id+'/pdf'}>Stáhnout PDF</a>:<p className="text-sm text-quiet">PDF není přiložené.</p>}
 {!invoice.paidOn&&invoice.status!=='cancelled'&&<form className="flex flex-col gap-3" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);void run(()=>payInvoiceAction({slug,id:invoice.id,day:fd.get('day'),method:fd.get('method')}),()=>toast.success('Platba je zapsaná.'))}}>
 <Field label="Datum platby"><Input name="day" type="date" max={today} defaultValue={today} required/></Field><PaymentMethod/><Button type="submit" disabled={pending}>Zapsat platbu</Button></form>}
 {invoice.direction==='issued'&&<><Button variant="outline" disabled={pending} onClick={()=>void run(()=>queueInvoiceAction({slug,id:invoice.id}),(r)=>toast.success(r.message))}>Poslat e-mailem</Button><p className="text-sm text-quiet">Odběratel dostane e-mail s PDF v příloze. Odpověď přijde na váš e-mail.</p></>}
 </div>
}
function PaymentMethod(){return <Field label="Způsob platby"><select className={selectClass} name="method" defaultValue="transfer"><option value="transfer">Převodem</option><option value="cash">Hotově</option><option value="card">Kartou</option><option value="other">Jinak</option></select></Field>}
export function TransactionForm({slug,today,closeHref}:{slug:string;today:string;closeHref:string}) {
 const {run,pending}=useWsAction(),router=useRouter()
 return <form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);void run(()=>addTransactionAction({slug,kind:fd.get('kind'),amount:Number(fd.get('amount')),currency:fd.get('currency'),day:fd.get('day'),category:fd.get('category'),description:fd.get('description'),method:fd.get('method')}),()=>{toast.success('Platba je zapsaná.');router.push(closeHref)})}}>
 <Field label="Typ"><select className={selectClass} name="kind"><option value="income">Příjem</option><option value="expense">Výdaj</option></select></Field>
 <Field label="Částka"><Input name="amount" type="number" min=".01" step=".01" required/></Field>
 <Field label="Měna"><select className={selectClass} name="currency"><option>CZK</option><option>EUR</option></select></Field>
 <Field label="Datum platby"><Input name="day" type="date" max={today} defaultValue={today} required/></Field>
 <Field label="Kategorie"><Input name="category" list="money-categories" maxLength={80} required/><datalist id="money-categories">{['Služby','Materiál','Nájem','Doprava','Vybavení','Ostatní'].map(c=><option key={c}>{c}</option>)}</datalist></Field>
 <Field label="Poznámka"><Input name="description" maxLength={500}/></Field><PaymentMethod/>
 <Button type="submit" disabled={pending}>Zapsat platbu</Button></form>
}
export function ReceivedForm({slug,today,closeHref,ai}:{slug:string;today:string;closeHref:string;ai:boolean}) {
 const {run,pending}=useWsAction(),router=useRouter()
 const [values,setValues]=useState<Record<string,string>>({number:'',name:'',address:'',ico:'',issuedOn:today,dueOn:today,amount:'',currency:'CZK',note:''})
 const [file,setFile]=useState<File|null>(null)
 const fd=()=>{const data=new FormData();for(const [k,v]of Object.entries(values))data.set(k,v);data.set('slug',slug);if(file)data.set('pdf',file);return data}
 return <form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();void run(()=>importInvoiceAction(fd()),r=>{toast.success('Faktura je uložená.');router.push('/w/'+slug+'/faktury?detail=faktura:'+r.id)})}}>
 <Field label="PDF do 4 MB"><Input type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]??null)}/></Field>
 {ai&&<Button type="button" variant="outline" disabled={!file||pending} onClick={()=>void run(()=>extractInvoiceAction(fd()),r=>{setValues(v=>({...v,...Object.fromEntries(Object.entries(r).filter(([,x])=>x!==null).map(([k,x])=>[k,String(x)]))}));toast.message('Údaje jsou přepsané. Před uložením je zkontrolujte.')})}>Přepsat z PDF</Button>}
 <p className="text-sm text-quiet">Přepis odešle dokument službě Anthropic. Údaje před uložením zkontrolujte. Datum platby vyplníte až po zaplacení.</p>
 {(['number','name','address','ico','issuedOn','dueOn','amount','currency','note'] as const).map(k=><Field key={k} label={({number:'Číslo faktury',name:'Dodavatel',address:'Adresa',ico:'IČO',issuedOn:'Vystaveno',dueOn:'Splatnost',amount:'Částka včetně DPH',currency:'Měna',note:'Poznámka'})[k]}>
 {k==='currency'?<select className={selectClass} value={values[k]} onChange={e=>setValues({...values,[k]:e.target.value})}><option>CZK</option><option>EUR</option></select>:<Input type={k.endsWith('On')?'date':k==='amount'?'number':'text'} min={k==='amount'?0:undefined} step={k==='amount'?'.01':undefined} required={!['ico','address','note'].includes(k)} maxLength={k==='note'?2000:k==='ico'?8:400} value={values[k]} onChange={e=>setValues({...values,[k]:e.target.value})}/>}
 </Field>)}<Button type="submit" disabled={pending}>Uložit fakturu</Button></form>
}
export function TaxForm({slug,settings=DEFAULT_TAX}:{slug:string;settings?:TaxSettings}) {
 const {run,pending}=useWsAction()
 return <form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);void run(()=>saveTaxAction({slug,mode:fd.get('mode'),flatRate:Number(fd.get('flatRate')),vatPayer:fd.has('vatPayer'),sideActivity:fd.has('sideActivity'),months:Number(fd.get('months')),healthMinimum:fd.has('healthMinimum'),taxpayerCredit:fd.has('taxpayerCredit'),flatBand:Number(fd.get('flatBand')),filing:fd.get('filing'),advances:Number(fd.get('advances'))}),()=>toast.success('Nastavení je uložené.'))}}>
 <p className="text-sm text-quiet">Nastavení platí pro celý účet, tedy jedno IČO. Odhad není daňové poradenství.</p>
 <Field label="Režim"><select className={selectClass} name="mode" defaultValue={settings.mode}><option value="flat_expenses">Výdaje procentem</option><option value="real">Skutečné výdaje</option><option value="flat_tax">Paušální daň</option></select></Field>
 <Field label="Výdajový paušál"><select className={selectClass} name="flatRate" defaultValue={settings.flatRate}>{[30,40,60,80].map(v=><option key={v} value={v}>{v} %</option>)}</select></Field>
 <Field label="Pásmo paušální daně"><select className={selectClass} name="flatBand" defaultValue={settings.flatBand}>{[1,2,3].map(v=><option key={v}>{v}</option>)}</select></Field>
 <Field label="Měsíců činnosti za rok"><Input name="months" type="number" min="1" max="12" defaultValue={settings.months} required/></Field>
 {(['vatPayer','sideActivity','healthMinimum','taxpayerCredit'] as const).map(k=><label key={k} className="flex min-h-11 items-center gap-3 text-sm"><input name={k} type="checkbox" defaultChecked={settings[k]}/>{({vatPayer:'Jsem plátce DPH',sideActivity:'Podnikám na vedlejší činnost',healthMinimum:'Platí pro mě minimum zdravotního pojištění',taxpayerCredit:'Uplatním celou slevu na poplatníka'})[k]}</label>)}
 <p className="text-sm text-quiet">Pokud slevu využíváte v zaměstnání, vypněte ji. Výpočet nezahrnuje mzdu, děti, odpočty ani začínající OSVČ se sníženým minimem.</p>
 <Field label="Uhrazené daně a pojistné"><Input name="advances" type="number" min="0" step=".01" defaultValue={settings.advances} required/></Field>
 <Field label="Podání přiznání"><select className={selectClass} name="filing" defaultValue={settings.filing}><option value="electronic">Elektronicky</option><option value="paper">Papírově</option><option value="advisor">S poradcem</option></select></Field>
 <Button type="submit" disabled={pending}>Uložit nastavení</Button></form>
}
