import 'server-only'
import { q, wsDb, type WsRow } from '../db'
import type { WsBusiness, WsContext } from '../context'
import { invoiceTotal, type MoneyEntry } from './calculations'
import { DEFAULT_TAX, issuerProfileSchema, taxSchema, type IssueInput, type Party, type TaxSettings, type InvoiceItem } from './schema'

type Biz = Pick<WsBusiness,'id'>
export type IssuerProfile = { name:string; address:string; ico:string; dic:string; bank:string; vatPayer:boolean }
function issuerProfileFrom(account:WsRow|undefined):IssuerProfile {
 const saved=account?.invoice_profile&&typeof account.invoice_profile==='object'&&!Array.isArray(account.invoice_profile)
   ?account.invoice_profile as Record<string,unknown>:{}
 const stringValue=(key:string,fallback:unknown)=>typeof saved[key]==='string'?String(saved[key]):String(fallback??'')
 return {name:stringValue('name',account?.name),address:stringValue('address',''),ico:stringValue('ico',account?.ico),
  dic:stringValue('dic',''),bank:stringValue('bank',''),vatPayer:typeof saved.vatPayer==='boolean'?saved.vatPayer:false}
}
export type Invoice = { id:string; businessId:string; businessSlug:string; direction:'issued'|'received'; number:string; customerId:string|null; jobId:string|null;
 counterparty:Party; issuer:Party & {vatPayer:boolean}; issuedOn:string; suppliedOn:string; dueOn:string; paidOn:string|null;
 amount:number; currency:'CZK'|'EUR'; items:InvoiceItem[]; status:string; note:string; hasPdf:boolean }
function invoiceRow(r:WsRow):Invoice {
 return {id:String(r.id),businessId:String(r.business_id),businessSlug:String(r.business_slug??''),direction:r.direction as Invoice['direction'],number:String(r.number??''),
 customerId:r.customer_id?String(r.customer_id):null,jobId:r.job_id?String(r.job_id):null,counterparty:r.counterparty as Party,issuer:r.issuer as Invoice['issuer'],
 issuedOn:String(r.issued_on??''),suppliedOn:String(r.supplied_on??''),dueOn:String(r.due_on??''),paidOn:r.paid_on?String(r.paid_on):null,
 amount:Number(r.amount),currency:r.currency as Invoice['currency'],items:r.items as InvoiceItem[],status:String(r.status),note:String(r.note??''),hasPdf:Boolean(r.has_pdf)}
}
export async function listInvoices(ctx:WsContext,business:Biz,all=false):Promise<Invoice[]> {
 const rows=await wsDb(ctx)`SELECT i.id,i.business_id,b.slug AS business_slug,i.direction,i.number,i.customer_id,i.job_id,i.counterparty,i.issuer,i.issued_on::text,i.supplied_on::text,i.due_on::text,i.paid_on::text,i.amount,i.currency,i.items,i.status,i.note,i.pdf_data IS NOT NULL AS has_pdf
 FROM ws.invoices i JOIN ws.businesses b ON b.account_id=i.account_id AND b.id=i.business_id
 WHERE i.account_id=${ctx.accountId} AND (${all} OR i.business_id=${business.id}) ORDER BY i.issued_on DESC NULLS LAST,i.created_at DESC LIMIT 500`
 return rows.map(invoiceRow)
}
export async function getOverdueInvoiceCount(ctx:WsContext,business:Biz,today:string,all=false):Promise<number> {
 const [row]=await wsDb(ctx)`SELECT count(*)::int AS count FROM ws.invoices
 WHERE account_id=${ctx.accountId} AND (${all} OR business_id=${business.id})
   AND direction='issued' AND status='issued' AND due_on<${today}::date`
 return Number(row?.count??0)
}
export async function getInvoice(ctx:WsContext,business:Biz,id:string):Promise<Invoice|null> {
 const [r]=await wsDb(ctx)`SELECT i.id,i.business_id,b.slug AS business_slug,i.direction,i.number,i.customer_id,i.job_id,i.counterparty,i.issuer,i.issued_on::text,i.supplied_on::text,i.due_on::text,i.paid_on::text,i.amount,i.currency,i.items,i.status,i.note,i.pdf_data IS NOT NULL AS has_pdf
 FROM ws.invoices i JOIN ws.businesses b ON b.account_id=i.account_id AND b.id=i.business_id
 WHERE i.account_id=${ctx.accountId} AND i.business_id=${business.id} AND i.id=${id}`
 return r?invoiceRow(r):null
}
export async function issueInvoice(ctx:WsContext,business:Biz,input:IssueInput) {
 const amount=invoiceTotal(input.items)
 const [row]=await wsDb(ctx)`SELECT ws.money_issue(${business.id}::uuid,${JSON.stringify({...input,amount})}::jsonb) AS id`
 return String(row.id)
}
export async function payInvoice(ctx:WsContext,business:Biz,id:string,day:string,method:string) {
 const [r]=await wsDb(ctx)`SELECT ws.money_pay(${business.id}::uuid,${id}::uuid,${day}::date,${method}) AS id`
 return r.id?String(r.id):null
}
export async function undoInvoicePayment(ctx:WsContext,business:Biz,id:string) {
 await wsDb(ctx)`SELECT ws.money_unpay(${business.id}::uuid,${id}::uuid)`
}
export type FinanceEntry = { id:string; businessId:string; kind:'income'|'expense'; amount:number;currency:'CZK'|'EUR';day:string;category:string;description:string;method:string;customer:string;service:string;source:string;segment:string }
export async function getFinance(ctx:WsContext,business:Biz,from:string,to:string,all=false):Promise<FinanceEntry[]> {
 const rows=await wsDb(ctx)`SELECT t.id,t.business_id,t.kind,t.amount,t.currency,t.occurred_on::text AS day,t.category,t.description,t.payment_method,
 c.name AS customer,s.name AS service,r.source,cs.segment
 FROM ws.transactions t
 LEFT JOIN ws.customers c ON c.account_id=t.account_id AND c.id=t.customer_id
 LEFT JOIN ws.appointments a ON a.account_id=t.account_id AND a.business_id=t.business_id AND a.id=t.appointment_id
 LEFT JOIN ws.jobs j ON j.account_id=t.account_id AND j.business_id=t.business_id AND j.id=t.job_id
 LEFT JOIN ws.requests r ON r.account_id=t.account_id AND r.business_id=t.business_id AND r.id=COALESCE(a.request_id,j.request_id) AND NOT r.is_test
 LEFT JOIN ws.services s ON s.account_id=t.account_id AND s.business_id=t.business_id AND s.id=COALESCE(a.service_id,r.service_id)
 LEFT JOIN ws.customer_segments cs ON cs.account_id=t.account_id AND cs.business_id=t.business_id AND cs.customer_id=t.customer_id
 WHERE t.account_id=${ctx.accountId} AND (${all} OR t.business_id=${business.id}) AND t.occurred_on>=${from}::date AND t.occurred_on<=${to}::date
 AND NOT EXISTS (SELECT 1 FROM ws.requests test WHERE test.account_id=t.account_id AND test.business_id=t.business_id AND test.id=COALESCE(a.request_id,j.request_id) AND test.is_test)
 ORDER BY t.occurred_on DESC,t.created_at DESC`
 return rows.map(r=>({id:String(r.id),businessId:String(r.business_id),kind:r.kind as FinanceEntry['kind'],amount:Number(r.amount),currency:r.currency as FinanceEntry['currency'],day:String(r.day),
 category:String(r.category??'Ostatní'),description:String(r.description??''),method:String(r.payment_method??'other'),customer:String(r.customer??''),service:String(r.service??'Bez služby'),source:String(r.source??'manual'),segment:String(r.segment??'unassigned')}))
}
/**
 * Součty plateb po měsících, měnách a druhu přímo v SQL (RD03). Vrací jeden
 * záznam na (měsíc, měna, druh) ve tvaru `MoneyEntry` s datem prvního dne
 * měsíce, takže `currencyTotals` a `monthSeries` dávají stejný výsledek jako
 * nad řádky z `getFinance` — bez přenosu a sčítání tisíců řádků v JS. Stejný
 * filtr: platby spojené se zkušební poptávkou se nepočítají. Měny se nesčítají.
 */
export async function getMoneyTotals(ctx:WsContext,business:Biz,from:string,to:string,all=false):Promise<MoneyEntry[]> {
 const rows=await wsDb(ctx)`SELECT to_char(t.occurred_on,'YYYY-MM') AS month,t.currency,t.kind,sum(round(t.amount*100))::text AS cents
 FROM ws.transactions t
 LEFT JOIN ws.appointments a ON a.account_id=t.account_id AND a.business_id=t.business_id AND a.id=t.appointment_id
 LEFT JOIN ws.jobs j ON j.account_id=t.account_id AND j.business_id=t.business_id AND j.id=t.job_id
 WHERE t.account_id=${ctx.accountId} AND (${all} OR t.business_id=${business.id}) AND t.occurred_on>=${from}::date AND t.occurred_on<=${to}::date
 AND NOT EXISTS (SELECT 1 FROM ws.requests test WHERE test.account_id=t.account_id AND test.business_id=t.business_id AND test.id=COALESCE(a.request_id,j.request_id) AND test.is_test)
 GROUP BY 1,2,3 ORDER BY 1,2,3`
 return rows.map(r=>({kind:r.kind as MoneyEntry['kind'],amount:Number(r.cents)/100,currency:String(r.currency),day:String(r.month)+'-01'}))
}
export async function getTaxSettings(ctx:WsContext):Promise<TaxSettings> {
 const [r]=await wsDb(ctx)`SELECT mode,flat_rate,vat_payer,side_activity,options FROM ws.tax_settings WHERE account_id=${ctx.accountId}`
 if(!r)return DEFAULT_TAX
 const parsed=taxSchema.safeParse({...DEFAULT_TAX,...(r.options as Record<string,unknown>),slug:'x',mode:r.mode,flatRate:Number(r.flat_rate),vatPayer:r.vat_payer,sideActivity:r.side_activity})
 if(!parsed.success)throw new Error('money_tax_settings_invalid')
 const {slug:_,...settings}=parsed.data;return settings
}
export async function saveTaxSettings(ctx:WsContext,settings:TaxSettings) {
 await wsDb(ctx)`INSERT INTO ws.tax_settings(account_id,mode,flat_rate,vat_payer,side_activity,options)
 VALUES(${ctx.accountId},${settings.mode},${settings.flatRate},${settings.vatPayer},${settings.sideActivity},${JSON.stringify(settings)}::jsonb)
 ON CONFLICT(account_id) DO UPDATE SET mode=EXCLUDED.mode,flat_rate=EXCLUDED.flat_rate,vat_payer=EXCLUDED.vat_payer,side_activity=EXCLUDED.side_activity,options=EXCLUDED.options WHERE ws.tax_settings.account_id=${ctx.accountId}`
}
export async function getIssuerProfile(ctx:WsContext):Promise<IssuerProfile> {
 const [account]=await wsDb(ctx)`SELECT name,ico,invoice_profile FROM ws.accounts WHERE id=${ctx.accountId}`
 return issuerProfileFrom(account)
}
export async function saveIssuerProfile(ctx:WsContext,profile:IssuerProfile) {
 await wsDb(ctx)`UPDATE ws.accounts SET invoice_profile=${JSON.stringify(profile)}::jsonb WHERE id=${ctx.accountId}`
}
export async function getInvoiceOptions(ctx:WsContext,business:Biz) {
 const [accounts,customers,jobs,services,messages]=await wsDb(ctx).batch([
  q`SELECT name,ico,invoice_profile FROM ws.accounts WHERE id=${ctx.accountId}`,
 q`SELECT id,name,email,phone FROM ws.customers WHERE account_id=${ctx.accountId} AND ended_at IS NULL ORDER BY name LIMIT 500`,
 q`SELECT j.id,j.title,j.customer_id,j.price,j.currency FROM ws.jobs j JOIN ws.stages s ON s.account_id=j.account_id AND s.business_id=j.business_id AND s.id=j.stage_id
 WHERE j.account_id=${ctx.accountId} AND j.business_id=${business.id} AND s.type IN ('done','paid') AND NOT EXISTS(SELECT 1 FROM ws.invoices i WHERE i.account_id=j.account_id AND i.business_id=j.business_id AND i.job_id=j.id AND i.direction='issued' AND i.status<>'cancelled')
 AND NOT EXISTS(SELECT 1 FROM ws.requests r WHERE r.account_id=j.account_id AND r.id=j.request_id AND r.is_test)
 ORDER BY j.updated_at DESC LIMIT 100`,
  q`SELECT id,name,price,currency FROM ws.services WHERE account_id=${ctx.accountId} AND business_id=${business.id} AND active=true ORDER BY position,name LIMIT 200`,
  q`SELECT enabled FROM ws.message_settings WHERE account_id=${ctx.accountId} AND business_id=${business.id} AND type='invoice'`,
 ])
 const account=accounts[0]
 const profile=issuerProfileFrom(account)
 return {profile,customers:customers.map(r=>({id:String(r.id),name:String(r.name),email:String(r.email??'')})),
 jobs:jobs.map(r=>({id:String(r.id),title:String(r.title),customerId:r.customer_id?String(r.customer_id):null,price:r.price===null?null:Number(r.price),currency:String(r.currency)})),
 services: services.map(r=>({id:String(r.id),name:String(r.name),price:r.price===null?null:Number(r.price),currency:String(r.currency)})),
 emailReady:Boolean(process.env.WS_EMAIL_FROM&&process.env.RESEND_API_KEY&&(messages[0]?.enabled??true))}
}
export async function monthMetrics(ctx:WsContext,business:Biz,from:string,to:string,all=false) {
 const [rows]=await wsDb(ctx).batch([q`SELECT count(*)::int AS requests,count(*) FILTER(WHERE source IN ('web','widget','page','eshop'))::int AS online,
 count(DISTINCT customer_id)::int AS customers FROM ws.requests WHERE account_id=${ctx.accountId} AND (${all} OR business_id=${business.id}) AND NOT is_test
 AND (created_at AT TIME ZONE 'Europe/Prague')::date>=${from}::date AND (created_at AT TIME ZONE 'Europe/Prague')::date<=${to}::date`])
 return {requests:Number(rows[0]?.requests??0),online:Number(rows[0]?.online??0),customers:Number(rows[0]?.customers??0)}
}
