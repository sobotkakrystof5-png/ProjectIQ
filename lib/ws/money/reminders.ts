import { getUpcomingTaxDeadlines,nextBusinessDay } from './deadlines'
import type { TaxSettings } from './schema'
export function moneyDeadlines(today:string,settings:TaxSettings) {
 if(settings.mode!=='flat_tax')return getUpcomingTaxDeadlines(today,settings.filing).filter(d=>d.authority==='financni_sprava')
 const [year,month]=today.split('-').map(Number)
 return Array.from({length:13},(_,i)=>{
  const d=new Date(Date.UTC(year,month-1+i,20)),day=d.toISOString().slice(0,10)
  return {id:'flat-'+day,title:'Paušální záloha',date:nextBusinessDay(day),sourceUrl:'https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/pausalni-dan'}
 }).filter(d=>d.date>=today).slice(0,12)
}
const escapeIcs=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\r/g,'')
export function taxCalendar(today:string,settings:TaxSettings,accountId:string) {
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ZakazIQ//Danove pripominky//CS','CALSCALE:GREGORIAN','METHOD:PUBLISH']
 for(const d of moneyDeadlines(today,settings)){
  const day=d.date.replace(/-/g,'')
  lines.push('BEGIN:VEVENT','UID:'+d.id+'-'+accountId+'@zakaziq.cz','DTSTAMP:'+today.replace(/-/g,'')+'T000000Z',
   'DTSTART;VALUE=DATE:'+day,'SUMMARY:'+escapeIcs(d.title),'DESCRIPTION:'+escapeIcs('Ověřte termín podle své situace. '+d.sourceUrl),
   'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-P7D','DESCRIPTION:'+escapeIcs(d.title),'END:VALARM','END:VEVENT')
 }
 lines.push('END:VCALENDAR');return lines.join('\r\n')+'\r\n'
}
