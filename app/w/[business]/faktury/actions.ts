'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireBusiness, requireWorkspace, type WsContext, type WsBusiness } from '@/lib/ws/context'
import { assertWritable } from '@/lib/ws/billing'
import { wsDb, pgErrorCode } from '@/lib/ws/db'
import { fail, ok, type Result } from '@/lib/ws/result'
import { getEnabledModules } from '@/lib/ws/today'
import { getInvoice, issueInvoice, payInvoice, saveTaxSettings } from '@/lib/ws/money/data'
import { amountSchema,currencySchema,dateSchema,issueSchema,paymentSchema,taxSchema,transactionSchema } from '@/lib/ws/money/schema'
import { readPdf } from '@/lib/ws/money/pdf'
import { extractReceivedPdf } from '@/lib/ws/money/ai'
import { hitLimit } from '@/lib/ws/intake/rate-limit'
import { pragueToday } from '@/lib/ws/time'

async function writable(ctx:WsContext,business:WsBusiness,module:string) {
 const blocked=await assertWritable(ctx);if(blocked)return blocked
 if(!(await getEnabledModules(ctx,business)).has(module))return fail('Tahle funkce je vypnutá. Zapněte ji v Nastavení.')
 return null
}
function failure(e:unknown,accountId:string):Result<never> {
 const code=pgErrorCode(e)
 if(code==='23505')return fail('Pro tuhle zakázku už faktura existuje. Otevřete ji v přehledu.')
 if(code==='P0002')return fail('Záznam tu není nebo zakázka ještě není hotová. Zkontrolujte údaje.')
 if(e instanceof Error&&e.message.includes('money_payment_mismatch'))return fail('Zakázka už má jinou platbu. Nejdřív ji zkontrolujte v přehledu příjmů.')
 if(e instanceof Error&&e.message.startsWith('money_pdf'))return fail('Vyberte PDF do 4 MB.')
 // Do logu nepatří obsah faktury ani celý objekt chyby z externí služby.
 console.error('[ws/money] Akce selhala.',{accountId,code:code??'unknown'})
 return fail('Nepodařilo se uložit. Zkuste to prosím znovu.')
}
export async function issueInvoiceAction(raw:unknown):Promise<Result<{id:string}>> {
 const ctx=await requireWorkspace()
 const parsed=issueSchema.safeParse(raw);if(!parsed.success)return fail('Zkontrolujte údaje faktury, částky a data.')
 const business=await requireBusiness(ctx,parsed.data.slug)
 const blocked=await writable(ctx,business,'invoices');if(blocked)return blocked
 try {
  const id=await issueInvoice(ctx,business,parsed.data)
  revalidatePath('/w');return ok({id})
 }catch(e){return failure(e,ctx.accountId)}
}
export async function payInvoiceAction(raw:unknown):Promise<Result<null>> {
 const ctx=await requireWorkspace()
 const p=paymentSchema.safeParse(raw);if(!p.success)return fail('Vyberte datum a způsob platby.')
 if(p.data.day>pragueToday())return fail('Platbu nejde zapsat do budoucna.')
 const b=await requireBusiness(ctx,p.data.slug),blocked=await writable(ctx,b,'invoices');if(blocked)return blocked
 try{await payInvoice(ctx,b,p.data.id,p.data.day,p.data.method);revalidatePath('/w');return ok(null)}catch(e){return failure(e,ctx.accountId)}
}
export async function addTransactionAction(raw:unknown):Promise<Result<null>> {
 const ctx=await requireWorkspace(),p=transactionSchema.safeParse(raw)
 if(!p.success)return fail('Zkontrolujte částku, datum a kategorii.')
 if(p.data.day>pragueToday())return fail('Platbu nejde zapsat do budoucna.')
 const b=await requireBusiness(ctx,p.data.slug),blocked=await writable(ctx,b,'finance');if(blocked)return blocked
 try {
  await wsDb(ctx)`INSERT INTO ws.transactions(account_id,business_id,kind,amount,currency,occurred_on,category,description,payment_method)
   VALUES(${ctx.accountId},${b.id},${p.data.kind},${p.data.amount},${p.data.currency},${p.data.day}::date,${p.data.category},${p.data.description},${p.data.method})`
  revalidatePath('/w');return ok(null)
 }catch(e){return failure(e,ctx.accountId)}
}
export async function saveTaxAction(raw:unknown):Promise<Result<null>> {
 const ctx=await requireWorkspace(),p=taxSchema.safeParse(raw)
 if(ctx.role!=='owner')return fail('Daňové nastavení může měnit jen vlastník účtu.')
 if(!p.success)return fail('Zkontrolujte daňové nastavení.')
 const b=await requireBusiness(ctx,p.data.slug),blocked=await writable(ctx,b,'taxes');if(blocked)return blocked
 try{const {slug:_,...settings}=p.data;await saveTaxSettings(ctx,settings);revalidatePath('/w');return ok(null)}catch(e){return failure(e,ctx.accountId)}
}
const receivedSchema=z.object({slug:z.string().max(60).min(1),number:z.string().trim().min(1).max(80),name:z.string().trim().min(1).max(160),address:z.string().trim().max(400),
 ico:z.string().max(8).regex(/^\d{8}$/).or(z.literal('')),issuedOn:dateSchema,dueOn:dateSchema,amount:amountSchema,currency:currencySchema,note:z.string().max(2000)})
 .refine(v=>v.dueOn>=v.issuedOn)
export async function importInvoiceAction(fd:FormData):Promise<Result<{id:string}>> {
 const ctx=await requireWorkspace()
 const p=receivedSchema.safeParse({...Object.fromEntries(fd.entries()),amount:Number(fd.get('amount'))})
 if(!p.success)return fail('Zkontrolujte číslo faktury, dodavatele, částku a data.')
 const b=await requireBusiness(ctx,p.data.slug),blocked=await writable(ctx,b,'invoices');if(blocked)return blocked
 try{
  const file=fd.get('pdf'),pdf=file instanceof File&&file.size?await readPdf(file):null
  const party={name:p.data.name,address:p.data.address,ico:p.data.ico,dic:'',email:'',bank:''}
  const [r]=await wsDb(ctx)`INSERT INTO ws.invoices(account_id,business_id,direction,number,counterparty,issued_on,due_on,amount,currency,status,note,pdf_data,pdf_filename)
   VALUES(${ctx.accountId},${b.id},'received',${p.data.number},${JSON.stringify(party)}::jsonb,${p.data.issuedOn}::date,${p.data.dueOn}::date,
   ${p.data.amount},${p.data.currency},'issued',${p.data.note},decode(${pdf?.base64??null}::text,'base64'),${pdf?.filename??null}) RETURNING id`
  revalidatePath('/w');return ok({id:String(r.id)})
 }catch(e){return failure(e,ctx.accountId)}
}
export async function extractInvoiceAction(fd:FormData):Promise<Result<Awaited<ReturnType<typeof extractReceivedPdf>>>> {
 const ctx=await requireWorkspace(),slug=z.string().min(1).max(60).safeParse(fd.get('slug'))
 if(!slug.success)return fail('Zkontrolujte vybraný byznys.')
 const b=await requireBusiness(ctx,slug.data),blocked=await writable(ctx,b,'invoices');if(blocked)return blocked
 try{
  if(await hitLimit({name:'money-ai',max:10,windowSec:3600},ctx.accountId))return fail('Přepis jste použili příliš často. Zkuste to za hodinu, nebo vyplňte fakturu ručně.')
  const file=fd.get('pdf');if(!(file instanceof File))return fail('Vyberte PDF do 4 MB.')
  return ok(await extractReceivedPdf((await readPdf(file)).base64))
 }catch(e){console.error('[ws/money] Přepis selhal.',{accountId:ctx.accountId,code:pgErrorCode(e)??'external'});return fail('Přepis se nepovedl. Fakturu můžete vyplnit ručně.')}
}
export async function queueInvoiceAction(raw:unknown):Promise<Result<null>> {
 const ctx=await requireWorkspace(),p=z.object({slug:z.string().min(1).max(60),id:z.string().uuid()}).safeParse(raw)
 if(!p.success)return fail('Vyberte fakturu.')
 const b=await requireBusiness(ctx,p.data.slug),blocked=await writable(ctx,b,'invoices');if(blocked)return blocked
 try{
  const i=await getInvoice(ctx,b,p.data.id)
  if(!i||i.direction!=='issued'||!['issued','paid'].includes(i.status))return fail('Tuhle fakturu nejde připravit k odeslání.')
  const email=z.string().email().max(254).safeParse(i.counterparty.email)
  if(!email.success)return fail('Na faktuře chybí e-mail odběratele.')
  // S15 doplní odesílací frontu a přílohu. Do té doby jde o koncept, nikoli odeslaný e-mail.
  await wsDb(ctx)`INSERT INTO ws.outbound_messages(account_id,business_id,customer_id,type,to_address,reply_to,subject,payload,status)
   SELECT ${ctx.accountId},${b.id},${i.customerId},'invoice',${email.data},${i.issuer.email||null},${'Faktura '+i.number},${JSON.stringify({invoiceId:i.id})}::jsonb,'draft'
   WHERE NOT EXISTS(SELECT 1 FROM ws.outbound_messages WHERE account_id=${ctx.accountId} AND business_id=${b.id} AND type='invoice' AND payload->>'invoiceId'=${i.id} AND status IN ('draft','queued','sending')) ON CONFLICT DO NOTHING`
  revalidatePath('/w');return ok(null)
 }catch(e){return failure(e,ctx.accountId)}
}
