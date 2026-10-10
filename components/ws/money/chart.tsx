import styles from './chart.module.css'
import { formatMoney,type WsCurrency } from '@/lib/ws/money'
import type { monthSeries } from '@/lib/ws/money/calculations'
export function MoneyChart({rows}:{rows:ReturnType<typeof monthSeries>}) {
 const currencies=Array.from(new Set(rows.flatMap(r=>Object.keys(r.totals))))
 if(!currencies.length)return <p className="py-8 text-sm text-quiet">Zapište první platbu. Tady uvidíte příjmy a výdaje po měsících.</p>
 return <div className="flex flex-col gap-6">{currencies.map(currency=>{
 const max=Math.max(1,...rows.flatMap(r=>[r.totals[currency]?.income??0,r.totals[currency]?.expense??0]))
 return <figure key={currency}><figcaption className="mb-3 flex flex-wrap gap-4 text-sm"><span className="font-num">{currency}</span><span className="text-navy-700 dark:text-navy-200">Příjmy: plný sloupec</span><span className="text-quiet">Výdaje: obrys</span></figcaption>
 <div className="relative flex gap-2 overflow-x-auto" role="img" aria-label={'Příjmy a výdaje po měsících v '+currency}>
 {rows.map((r,n)=>{const t=r.totals[currency]??{income:0,expense:0};return <div key={r.month} className="min-w-10 flex-1">
 <div className="flex h-40 items-end justify-center gap-1" title={r.month+': příjmy '+formatMoney(t.income,{currency:currency as WsCurrency})+', výdaje '+formatMoney(t.expense,{currency:currency as WsCurrency})}>
 {(['income','expense'] as const).map(k=><div key={k} className={styles.bar+' w-3 origin-bottom rounded-tiny '+(k==='income'?'bg-navy-700 dark:bg-navy-300':'border-2 border-quiet bg-transparent')}
 style={{height:Math.max(t[k]>0?2:0,t[k]/max*100)+'%',animationDelay:n*.12+'s'}}/>)}</div>
 <p className="mt-2 text-center font-num text-[10px] text-quiet">{r.month.slice(5)}/{r.month.slice(2,4)}</p>
 <p className="sr-only">{r.month}: příjmy {formatMoney(t.income,{currency:currency as WsCurrency})}, výdaje {formatMoney(t.expense,{currency:currency as WsCurrency})}</p>
 </div>})}</div></figure>
 })}</div>
}
