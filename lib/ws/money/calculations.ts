import type { InvoiceItem, TaxSettings } from './schema'

// Sazby ověřeny 2026-10-10; zdroje jsou v docs/workspace/MONEY.md.
// Originály adminu se nepoužívají: obsahují staré pravidlo DPH za 12 měsíců.
export const RATES = { year:2026, taxBase:0.15, taxUpper:0.23, upperThreshold:48967*36,
 credit:30840, social:0.292, socialShare:0.55, socialMainBase:17139,
 socialSideBase:5387, socialMaxBase:2350416, sideThreshold:117521, sideReduction:9794,
 health:0.135, healthShare:0.5, healthMinBase:24483.5,
 flatTax:[9162,16745,27139], vatLimit:2000000, vatImmediate:2536500 } as const
export function itemTotals(item: InvoiceItem) {
 const net = Math.round(item.quantity * Math.round(item.unitPrice*100))
 const vat = Math.round(net * item.vatRate / 100)
 return { net:net/100, vat:vat/100, total:(net+vat)/100 }
}
export function invoiceTotal(items: InvoiceItem[]) {
 const total = items.reduce((sum,i)=>sum+Math.round(itemTotals(i).total*100),0)
 if (!Number.isSafeInteger(total)||total>999999999999) throw new Error('money_amount_too_large')
 return total/100
}
export type MoneyEntry = { kind:'income'|'expense'; amount:number; currency:string; day:string; category?:string }
export function currencyTotals(entries: MoneyEntry[]) {
 const totals: Record<string,{income:number;expense:number;balance:number}> = {}
 for(const t of entries) {
  const v = totals[t.currency] ??= {income:0,expense:0,balance:0}
  v[t.kind] += Math.round(t.amount*100)
 }
 for(const v of Object.values(totals)) { v.balance=(v.income-v.expense)/100;v.income/=100;v.expense/=100 }
 return totals
}
export function estimateTax(income: number, expenses: number, settings: TaxSettings, year:number) {
 if(year!==RATES.year) return null
 const months=settings.months
 if(settings.mode==='flat_tax') {
  const monthly=RATES.flatTax[settings.flatBand-1]
  return {tax:null,social:null,health:null,total:monthly*months,remaining:Math.max(0,monthly*months-settings.advances),monthly,base:null}
 }
 const costs=settings.mode==='real'?Math.max(0,expenses):Math.min(Math.max(0,income)*settings.flatRate/100,2000000*settings.flatRate/100)
 const base=Math.max(0,income-costs), roundedBase=Math.floor(base/100)*100
 const tax=Math.ceil(Math.max(0, Math.min(roundedBase,RATES.upperThreshold)*RATES.taxBase+Math.max(0,roundedBase-RATES.upperThreshold)*RATES.taxUpper-(settings.taxpayerCredit?RATES.credit:0)))
 const threshold=RATES.sideThreshold-(12-months)*RATES.sideReduction
 const socialBase=Math.min(RATES.socialMaxBase,Math.max(base*RATES.socialShare,(settings.sideActivity?RATES.socialSideBase:RATES.socialMainBase)*months))
 const social=settings.sideActivity&&base<threshold?0:Math.ceil(socialBase*RATES.social)
 const health=Math.ceil(Math.max(base*RATES.healthShare,settings.healthMinimum?RATES.healthMinBase*months:0)*RATES.health)
 const total=tax+social+health,remaining=Math.max(0,total-settings.advances)
 return {tax,social,health,total,remaining,monthly:Math.ceil(remaining/months),base}
}
export function monthSeries(entries:MoneyEntry[], lastMonth:string, count:6|12) {
 const [y,m]=lastMonth.split('-').map(Number)
 return Array.from({length:count},(_,i)=>{
  const d=new Date(Date.UTC(y,m-count+i,1)); const month=d.toISOString().slice(0,7)
  return {month,totals:currencyTotals(entries.filter(t=>t.day.startsWith(month)))}
 })
}
