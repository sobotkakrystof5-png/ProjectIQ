import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { q,setWsDriverForTests,wsDb } from '../db'
import { createWsTestDb,ids,pgliteDriver } from './helpers/ws-pglite'
import type { WsContext } from '../context'
import { getFinance,getInvoice,getInvoiceOptions,getIssuerProfile,getTaxSettings,issueInvoice,payInvoice,saveIssuerProfile,undoInvoicePayment,type Invoice } from '../money/data'
import { currencyTotals,estimateTax,invoiceTotal,monthSeries } from '../money/calculations'
import { DEFAULT_TAX } from '../money/defaults'
import { issueSchema,type IssueInput } from '../money/schema'
import { readPdf,isPublicV4,invoiceHtml,renderInvoicePdf,spaydPaymentString } from '../money/pdf'
import { moneyDeadlines,taxCalendar } from '../money/reminders'

vi.mock('server-only',()=>({}))
let db:PGlite
const A=ids('a'),B=ids('b')
const ctx:WsContext={accountId:A.account,userId:'user_a',role:'owner'}
const ctxB:WsContext={accountId:B.account,userId:'user_b',role:'owner'}
const biz={id:A.business}
const party={name:'Firma s háčky',address:'Ulice 1, Praha',ico:'12345678',dic:'',bank:'123/0800',email:'test@example.cz'}
const input=(patch:Partial<IssueInput>={}):IssueInput=>({slug:'byznys-a',issuer:{...party,vatPayer:false},counterparty:party,jobId:null,customerId:A.customer,
 issuedOn:'2026-10-10',suppliedOn:'2026-10-10',dueOn:'2026-10-24',currency:'CZK',items:[{description:'Služba',quantity:1,unitPrice:1000,vatRate:0}],note:'',...patch})
beforeAll(async()=>{({db}=await createWsTestDb());setWsDriverForTests(pgliteDriver(db))},60_000)
afterAll(async()=>{setWsDriverForTests(null);await db?.close()})
describe('Peníze: částky a sazby',()=>{
 it('měny zůstávají oddělené, haléře se neztratí',()=>{
  expect(currencyTotals([{kind:'income',currency:'CZK',amount:.1,day:'x'},{kind:'income',currency:'CZK',amount:.2,day:'x'},{kind:'income',currency:'EUR',amount:100,day:'x'},{kind:'expense',currency:'CZK',amount:.1,day:'x'}])).toEqual({CZK:{income:.3,expense:.1,balance:.2},EUR:{income:100,expense:0,balance:100}})
 })
 it('položky se násobí a DPH zaokrouhluje v haléřích',()=>expect(invoiceTotal([{description:'X',unitPrice:100,quantity:2.5,vatRate:21}])).toBe(302.5))
 it('paušální výdaje mají strop, pokračují i nad 2 miliony',()=>{const e=estimateTax(3000000,0,{...DEFAULT_TAX,sideActivity:true,healthMinimum:false},2026)!;expect(e.base).toBe(1800000);expect(e.tax).toBe(242136)})
 it('student s příjmem 250 tisíc: sociální neplatí, zdravotní 6750',()=>{const e=estimateTax(250000,0,{...DEFAULT_TAX,sideActivity:true,healthMinimum:false},2026)!;expect(e.tax).toBe(0);expect(e.social).toBe(0);expect(e.health).toBe(6750)})
 it('rozhodná částka sociální je včetně hranice',()=>{const e=estimateTax(117521,0,{...DEFAULT_TAX,mode:'real',sideActivity:true,healthMinimum:false},2026)!;expect(e.social).toBeGreaterThan(0)})
 it('hlavní činnost počítá minimum snížené zpětně pro rok 2026',()=>{const e=estimateTax(0,0,DEFAULT_TAX,2026)!;expect(e.social).toBe(60056);expect(e.health).toBe(39664)})
 it('paušální daň používá po novele 9162, zálohy se odečítají',()=>{const e=estimateTax(500000,0,{...DEFAULT_TAX,mode:'flat_tax',advances:10000},2026)!;expect(e.total).toBe(109944);expect(e.remaining).toBe(99944)})
 it('jiný rok nepoužije nesprávné sazby',()=>expect(estimateTax(100000,0,DEFAULT_TAX,2027)).toBeNull())
 it('paušální termín po 20. dni přejde do dalšího měsíce',()=>expect(moneyDeadlines('2026-10-21',{...DEFAULT_TAX,mode:'flat_tax'})[0].date).toBe('2026-11-20'))
 it('kalendář obsahuje připomínku sedm dní předem',()=>{const ics=taxCalendar('2026-10-10',DEFAULT_TAX,A.account);expect(ics).toContain('TRIGGER:-P7D');expect(ics).toContain('BEGIN:VCALENDAR');expect(ics).toContain('DTSTART;VALUE=DATE:20270503')})
 it('graf 12 měsíců přechází přes rok',()=>{const s=monthSeries([],'2026-03',12);expect(s[0].month).toBe('2025-04');expect(s[11].month).toBe('2026-03')})
 it('validace odmítne neplatné datum, delší text a DPH neplátce',()=>{
  expect(issueSchema.safeParse(input({issuedOn:'2026-02-30'})).success).toBe(false)
  expect(issueSchema.safeParse(input({note:'a'.repeat(2001)})).success).toBe(false)
  expect(issueSchema.safeParse(input({items:[{description:'x',unitPrice:1,quantity:1,vatRate:21}]})).success).toBe(false)
 })
})
describe('Peníze: transakce pod RLS',()=>{
 it('vystavení má jednu řadu za účet i při souběhu',async()=>{
  const ids=await Promise.all(Array.from({length:8},()=>issueInvoice(ctx,biz,input())))
  const numbers=await Promise.all(ids.map(id=>getInvoice(ctx,biz,id).then(i=>i!.number)))
  expect(new Set(numbers).size).toBe(8)
  const values=numbers.map(n=>Number(n.slice(5))).sort((a,b)=>a-b)
  expect(values).toEqual(Array.from({length:8},(_,n)=>values[0]+n))
 })
 it('další byznys stejného účtu pokračuje v řadě, cizí účet má svou',async()=>{
  const [b]=await wsDb(ctx)`INSERT INTO ws.businesses(account_id,name,slug) VALUES(${ctx.accountId},'Další','dalsi-test') RETURNING id`
  const first=(await getInvoice(ctx,biz,await issueInvoice(ctx,biz,input())))!
  const otherBiz={id:String(b.id)},second=(await getInvoice(ctx,otherBiz,await issueInvoice(ctx,otherBiz,input())))!
  expect(Number(second.number.slice(5))).toBe(Number(first.number.slice(5))+1)
  const own=(await getInvoice(ctxB,{id:B.business},await issueInvoice(ctxB,{id:B.business},input({customerId:B.customer}))))!
  expect(own.number).toBe('2026-000001')
 })
 it('neúspěch nezanechá díru v řadě',async()=>{
  const first=await getInvoice(ctx,biz,await issueInvoice(ctx,biz,input()))
  await expect(issueInvoice(ctx,biz,input({customerId:B.customer}))).rejects.toThrow()
  const second=await getInvoice(ctx,biz,await issueInvoice(ctx,biz,input()))
  expect(Number(second!.number.slice(5))).toBe(Number(first!.number.slice(5))+1)
 })
 it('cizí účet fakturu nevidí ani nezaplatí',async()=>{
  const id=await issueInvoice(ctx,biz,input())
  expect(await getInvoice(ctxB,{id:B.business},id)).toBeNull()
  await expect(payInvoice(ctxB,{id:B.business},id,'2026-10-10','transfer')).rejects.toThrow()
  await expect(issueInvoice(ctxB,biz,input())).rejects.toThrow()
 })
 it('Zpět smaže jen příjem vytvořený fakturou a dovolí platbu znovu zapsat',async()=>{
  const id=await issueInvoice(ctx,biz,input())
  await payInvoice(ctx,biz,id,'2026-10-10','transfer')
  await undoInvoicePayment(ctx,biz,id)
  const [invoice]=await wsDb(ctx)`SELECT status,paid_on FROM ws.invoices WHERE account_id=${ctx.accountId} AND id=${id}`
  const [transactions]=await wsDb(ctx)`SELECT count(*)::int AS count FROM ws.transactions WHERE account_id=${ctx.accountId} AND invoice_id=${id}`
  expect(invoice.status).toBe('issued');expect(invoice.paid_on).toBeNull();expect(transactions.count).toBe(0)
  await payInvoice(ctx,biz,id,'2026-10-10','transfer')
  const [again]=await wsDb(ctx)`SELECT count(*)::int AS count FROM ws.transactions WHERE account_id=${ctx.accountId} AND invoice_id=${id}`
  expect(again.count).toBe(1)
 })
 it('Zpět funguje i u nulové faktury bez účetní transakce',async()=>{
  const id=await issueInvoice(ctx,biz,input({items:[{description:'Bez částky',quantity:1,unitPrice:0,vatRate:0}]}))
  await payInvoice(ctx,biz,id,'2026-10-10','transfer')
  await undoInvoicePayment(ctx,biz,id)
  const [invoice]=await wsDb(ctx)`SELECT status,paid_on FROM ws.invoices WHERE account_id=${ctx.accountId} AND id=${id}`
  expect(invoice.status).toBe('issued');expect(invoice.paid_on).toBeNull()
 })
 it('Zpět odpojí převzatou platbu zakázky, ale příjem zachová',async()=>{
  await db.query('UPDATE ws.stages SET type=$1 WHERE id=$2',['done',A.stage])
  const [{id:job}]=await wsDb(ctx)`INSERT INTO ws.jobs(account_id,business_id,stage_id,customer_id,title,price) VALUES(${ctx.accountId},${A.business},${A.stage},${A.customer},'Převzatá platba',1000) RETURNING id`
  const [{id:transaction}]=await wsDb(ctx)`INSERT INTO ws.transactions(account_id,business_id,kind,amount,currency,occurred_on,job_id) VALUES(${ctx.accountId},${A.business},'income',1000,'CZK','2026-10-08',${job}) RETURNING id`
  const id=await issueInvoice(ctx,biz,input({jobId:String(job)}))
  await payInvoice(ctx,biz,id,'2026-10-10','transfer')
  await undoInvoicePayment(ctx,biz,id)
  const [payment]=await wsDb(ctx)`SELECT invoice_id,job_id FROM ws.transactions WHERE account_id=${ctx.accountId} AND id=${transaction}`
  expect(payment.invoice_id).toBeNull();expect(payment.job_id).toBe(job)
  const [count]=await wsDb(ctx)`SELECT count(*)::int AS value FROM ws.transactions WHERE account_id=${ctx.accountId} AND job_id=${job}`
  expect(count.value).toBe(1)
 })
 it('souběžné zaplacení a Zpět neudělá dvojí příjem',async()=>{
  const id=await issueInvoice(ctx,biz,input())
  await Promise.all([payInvoice(ctx,biz,id,'2026-10-10','transfer'),payInvoice(ctx,biz,id,'2026-10-10','transfer')])
  await Promise.allSettled([undoInvoicePayment(ctx,biz,id),undoInvoicePayment(ctx,biz,id)])
  const [invoice]=await wsDb(ctx)`SELECT status FROM ws.invoices WHERE account_id=${ctx.accountId} AND id=${id}`
  const [count]=await wsDb(ctx)`SELECT count(*)::int AS value FROM ws.transactions WHERE account_id=${ctx.accountId} AND invoice_id=${id}`
  expect(invoice.status).toBe('issued');expect(count.value).toBe(0)
 })
 it('cizí účet platbu faktury nevrátí',async()=>{
  const id=await issueInvoice(ctx,biz,input());await payInvoice(ctx,biz,id,'2026-10-10','transfer')
  await expect(undoInvoicePayment(ctxB,{id:B.business},id)).rejects.toThrow()
  expect((await getInvoice(ctx,biz,id))?.paidOn).toBe('2026-10-10')
 })
 it('opakované i souběžné zaplacení vytvoří právě jeden příjem',async()=>{
  const id=await issueInvoice(ctx,biz,input())
  await Promise.all([payInvoice(ctx,biz,id,'2026-10-10','transfer'),payInvoice(ctx,biz,id,'2026-10-10','transfer')])
  const rows=await wsDb(ctx)`SELECT count(*)::int AS n FROM ws.transactions WHERE account_id=${ctx.accountId} AND invoice_id=${id}`
  expect(rows[0].n).toBe(1)
 })
 it('nezaplacená faktura nevytvoří příjem',async()=>{
  const id=await issueInvoice(ctx,biz,input())
  const rows=await wsDb(ctx)`SELECT count(*)::int AS n FROM ws.transactions WHERE account_id=${ctx.accountId} AND invoice_id=${id}`
  expect(rows[0].n).toBe(0)
 })
 it('přijatá faktura zapisuje výdaj',async()=>{
  const [r]=await wsDb(ctx)`INSERT INTO ws.invoices(account_id,business_id,direction,number,amount,currency,status) VALUES(${ctx.accountId},${A.business},'received','D-1',100,'EUR','issued') RETURNING id`
  await payInvoice(ctx,biz,String(r.id),'2026-10-10','transfer')
  const [t]=await wsDb(ctx)`SELECT kind,currency FROM ws.transactions WHERE account_id=${ctx.accountId} AND invoice_id=${r.id}`
  expect(t.kind).toBe('expense');expect(t.currency).toBe('EUR')
 })
 it('platba z návštěvy se převezme při pozdějším zaplacení faktury',async()=>{
  await db.query('UPDATE ws.stages SET type=$1 WHERE id=$2',['done',A.stage])
  const [{id:job}]=await wsDb(ctx)`INSERT INTO ws.jobs(account_id,business_id,stage_id,customer_id,title,price) VALUES(${ctx.accountId},${A.business},${A.stage},${A.customer},'Platba před fakturou',1000) RETURNING id`
  await wsDb(ctx)`INSERT INTO ws.transactions(account_id,business_id,kind,amount,currency,occurred_on,job_id) VALUES(${ctx.accountId},${A.business},'income',1000,'CZK','2026-10-08',${job})`
  const id=await issueInvoice(ctx,biz,input({jobId:String(job)}))
  await payInvoice(ctx,biz,id,'2026-10-10','transfer')
  const [r]=await wsDb(ctx)`SELECT count(*)::int AS n FROM ws.transactions WHERE account_id=${ctx.accountId} AND job_id=${job}`
  expect(r.n).toBe(1);expect((await getInvoice(ctx,biz,id))!.paidOn).toBe('2026-10-08')
 })
 it('příjmy a možnosti faktury čtou pouze účet',async()=>{
  expect((await getFinance(ctx,biz,'2026-01-01','2026-12-31')).every(r=>r.businessId===A.business)).toBe(true)
  expect((await getInvoiceOptions(ctx,biz)).customers.every(r=>r.id!==B.customer)).toBe(true)
  expect((await getTaxSettings(ctx)).mode).toBe('flat_expenses')
 })
 it('profil dodavatele zůstává oddělený podle účtu a služby jsou dostupné pro fakturu',async()=>{
  await saveIssuerProfile(ctx,{name:'Firma A',address:'Ulice 1',ico:'12345678',dic:'',bank:'CZ6508000000192000145399',vatPayer:false})
  await saveIssuerProfile(ctxB,{name:'Firma B',address:'Ulice 2',ico:'87654321',dic:'',bank:'',vatPayer:false})
  expect(await getIssuerProfile(ctx)).toMatchObject({name:'Firma A',ico:'12345678'})
  expect(await getIssuerProfile(ctxB)).toMatchObject({name:'Firma B',ico:'87654321'})
  const [service]=await wsDb(ctx)`SELECT id FROM ws.services WHERE account_id=${ctx.accountId} AND business_id=${A.business}`
  await wsDb(ctx)`UPDATE ws.services SET price=450,currency='CZK' WHERE account_id=${ctx.accountId} AND id=${service.id}`
  expect((await getInvoiceOptions(ctx,biz)).services).toContainEqual(expect.objectContaining({id:String(service.id),name:'Služba',price:450}))
  expect((await getInvoiceOptions(ctxB,{id:B.business})).services.every(item=>item.id!==String(service.id))).toBe(true)
 })
 it('zakázka musí být hotová, nesmí dostat druhou fakturu',async()=>{
  await expect(issueInvoice(ctx,biz,input({jobId:A.job}))).rejects.toThrow()
  await db.query('UPDATE ws.stages SET type=$1 WHERE id=$2',['done',A.stage])
  // Seed faktura už zakázku používá.
  await expect(issueInvoice(ctx,biz,input({jobId:A.job}))).rejects.toThrow()
 })
 it('platba návštěvy a faktury za tutéž zakázku se sloučí',async()=>{
  const [{id:job}]=await wsDb(ctx)`INSERT INTO ws.jobs(account_id,business_id,stage_id,customer_id,title,price) VALUES(${ctx.accountId},${A.business},${A.stage},${A.customer},'Hotová',1000) RETURNING id`
  const [{id:appointment}]=await wsDb(ctx)`INSERT INTO ws.appointments(account_id,business_id,staff_id,customer_id,job_id,starts_at,ends_at,status) VALUES(${ctx.accountId},${A.business},${A.staff},${A.customer},${job},'2026-10-09 10:00+02','2026-10-09 11:00+02','confirmed') RETURNING id`
  const id=await issueInvoice(ctx,biz,input({jobId:String(job)}))
  await payInvoice(ctx,biz,id,'2026-10-10','cash')
  await wsDb(ctx)`INSERT INTO ws.transactions(account_id,business_id,kind,amount,currency,occurred_on,job_id,appointment_id) VALUES(${ctx.accountId},${A.business},'income',1000,'CZK','2026-10-10',${job},${appointment})`
  const [r]=await wsDb(ctx)`SELECT count(*)::int AS n FROM ws.transactions WHERE account_id=${ctx.accountId} AND job_id=${job}`
  expect(r.n).toBe(1)
 })
})
describe('PDF a síť',()=>{
 it('QR používá platný český IBAN a ignoruje běžné číslo účtu',async()=>{
  const invoice:Invoice={id:'x',businessId:'x',businessSlug:'x',direction:'issued',number:'2026-000042',customerId:null,jobId:null,
   counterparty:party,issuer:{...party,bank:'CZ6508000000192000145399',vatPayer:false},issuedOn:'2026-10-10',suppliedOn:'2026-10-10',dueOn:'2026-10-24',paidOn:null,
   amount:1250.5,currency:'CZK',items:[],status:'issued',note:'',hasPdf:false}
  expect(spaydPaymentString(invoice)).toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:1250.50*CC:CZK*X-VS:2026000042')
  const html=await invoiceHtml(invoice,{name:'Test',logo:null})
  expect(html).toContain('Zaplatit QR kódem');expect(html).toContain('<svg')
  expect(await invoiceHtml({...invoice,status:'paid',paidOn:'2026-10-10'},{name:'Test',logo:null})).not.toContain('Zaplatit QR kódem')
  expect(spaydPaymentString({...invoice,issuer:{...invoice.issuer,bank:'19-2000145399/0800'}})).toBeNull()
  expect(spaydPaymentString({...invoice,currency:'EUR'})).toBeNull()
 })
 it('odmítne falešné PDF i velikost',async()=>{
  await expect(readPdf(new File(['<script>x</script>'],'invoice.pdf'))).rejects.toThrow('money_pdf_type')
  await expect(readPdf(new File([new Uint8Array(4*1024*1024+1)],'x.pdf'))).rejects.toThrow('money_pdf_size')
 })
 it('logo nesmí mířit do privátní sítě',()=>{for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','169.254.169.254','192.168.0.1','::1'])expect(isPublicV4(ip)).toBe(false);expect(isPublicV4('1.1.1.1')).toBe(true)})
 it('HTML escapuje názvy a poznámky',async()=>{
  const id=await issueInvoice(ctx,biz,input({note:'<script>alert(1)</script>'})),invoice=(await getInvoice(ctx,biz,id))!
  const html=await invoiceHtml(invoice,{name:'Test',logo:null})
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>')
 })
 it.runIf(process.env.WS_PDF_SMOKE==='1')('PDF se skutečně vykreslí s českými znaky',async()=>{
  const id=await issueInvoice(ctx,biz,input()),i=(await getInvoice(ctx,biz,id))!
  const pdf=await renderInvoicePdf(i,{name:'Český byznys',logo:null})
  expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.length).toBeGreaterThan(10000)
 },30000)
})
