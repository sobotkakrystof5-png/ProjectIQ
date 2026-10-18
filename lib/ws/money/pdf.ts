import 'server-only'
import { readFile } from 'fs/promises'
import path from 'path'
import { lookup } from 'dns/promises'
import https from 'https'
import { isIP } from 'net'
import type { Invoice } from './data'
import { itemTotals } from './calculations'
import { formatMoney } from '../money'
import { formatDayShort } from '../time'

export const MAX_PDF_BYTES=4*1024*1024
export async function readPdf(file:File) {
 if(file.size===0||file.size>MAX_PDF_BYTES)throw new Error('money_pdf_size')
 const data=Buffer.from(await file.arrayBuffer())
 if(data.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error('money_pdf_type')
 return {base64:data.toString('base64'),filename:file.name.replace(/[\r\n\/\\]/g,'_').slice(0,120)||'faktura.pdf'}
}
// Logo se stáhne s připnutou veřejnou IPv4, bez redirectů. Chromium nemá síť.
export function isPublicV4(ip:string) {
 if(isIP(ip)!==4)return false
 const [a,b]=ip.split('.').map(Number)
 return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)))
}
async function logoData(raw:string|null):Promise<string|null> {
 if(!raw)return null
 const url=new URL(raw)
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new Error('money_logo_url')
 const addresses=await lookup(url.hostname,{all:true,family:4})
 if(!addresses.length||addresses.some(a=>!isPublicV4(a.address)))throw new Error('money_logo_private')
 const address=addresses[0].address
 const data=await new Promise<Buffer>((resolve,reject)=>{
  const req=https.get(url,{lookup:(_host,_options,callback)=>callback(null,address,4),timeout:5000},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error('money_logo_http'));return}
   const chunks:Buffer[]=[];let size=0
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>512*1024){res.destroy(new Error('money_logo_size'));return}chunks.push(chunk)})
   res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject)
  });req.on('timeout',()=>req.destroy(new Error('money_logo_timeout')));req.on('error',reject)
 })
 const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
 const jpeg=data[0]===255&&data[1]===216&&data[2]===255
 if(!png&&!jpeg)throw new Error('money_logo_type')
 return 'data:image/'+(png?'png':'jpeg')+';base64,'+data.toString('base64')
}
async function fontCss() {
 const dir=path.join(process.cwd(),'lib/ws/money/assets')
 const raw=await readFile(path.join(dir,'fonts.css'),'utf8')
 const names=Array.from(new Set(Array.from(raw.matchAll(/FONT:([^\)]+)/g)).map(m=>m[1])))
 let css=raw
 for(const name of names)css=css.replaceAll('FONT:'+name,'data:font/woff2;base64,'+(await readFile(path.join(dir,name))).toString('base64'))
 return css
}
const CSS = '@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:InvoiceSans,sans-serif;font-size:13px;color:rgb(var(--ink));background:rgb(var(--surface))}h1{font-size:32px;letter-spacing:-.03em;margin:0}p{margin:5px 0;white-space:pre-line;overflow-wrap:anywhere}.brand{display:flex;align-items:center;gap:16px;border-bottom:2px solid rgb(var(--navy-100));padding-bottom:20px}.brand img{max-width:100px;max-height:60px}.tiles{display:grid;grid-template-columns:12px 12px;gap:4px}.tiles i{height:12px;border-radius:3px;background:rgb(var(--navy-700))}.parties{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:30px 0}small{color:rgb(var(--quiet))}.numbers{font-family:InvoiceMono,monospace}table{border-collapse:collapse;width:100%;margin:24px 0}th{text-align:left;color:rgb(var(--quiet));font-weight:500}td,th{padding:12px 6px;border-bottom:1px solid rgb(var(--navy-100))}tr{break-inside:avoid}td:last-child{text-align:right}.total{border-radius:20px;padding:20px;background:rgb(var(--navy-50));text-align:right;font-size:22px}.foot{margin-top:25px;font-size:12px}.payment-qr{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:24px;padding:18px;border:1px solid rgb(var(--navy-100));border-radius:16px;break-inside:avoid}.payment-qr svg{width:148px;height:148px;flex:none}.payment-qr h2{font-size:16px;margin:0 0 8px}'

export function spaydPaymentString(invoice:Invoice):string|null {
 if(invoice.direction!=='issued'||invoice.status!=='issued'||invoice.currency!=='CZK'||typeof invoice.issuer?.bank!=='string')return null
 const iban=invoice.issuer.bank.replace(/\s/g,'').toUpperCase()
 if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)||iban.length>34)return null
 const rearranged=iban.slice(4)+iban.slice(0,4)
 let remainder=0
 for(const char of rearranged){
  const digits=char>='A'&&char<='Z'?String(char.charCodeAt(0)-55):char
  for(const digit of digits)remainder=(remainder*10+Number(digit))%97
 }
 if(remainder!==1)return null
 const variableSymbol=invoice.number.replace(/\D/g,'').slice(0,10)
 return 'SPD*1.0*ACC:'+iban+'*AM:'+invoice.amount.toFixed(2)+'*CC:CZK'+(variableSymbol?'*X-VS:'+variableSymbol:'')
}
export async function invoiceHtml(invoice:Invoice,brand:{name:string;logo:string|null}) {
 let logo:string|null=null
 try {logo=await logoData(brand.logo)}catch {console.warn('[ws/money] Logo se do PDF nepodařilo načíst.')}
 const tokens=await readFile(path.join(process.cwd(),'app/ws-tokens.css'),'utf8')

 const text=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
 const party=(p:Invoice['counterparty'])=>'<strong>'+text(p.name)+'</strong><p>'+text(p.address)+'</p>'+(p.ico?'<p>IČO '+text(p.ico)+'</p>':'')+(p.dic?'<p>DIČ '+text(p.dic)+'</p>':'')
 const amount=(n:number)=>text(formatMoney(n,{currency:invoice.currency}))
 const num=(value:string)=>'<span class="numbers">'+text(value)+'</span>'
 const rows=invoice.items.map(i=>'<tr><td>'+text(i.description)+'</td><td class="numbers">'+text(i.quantity)+'</td><td class="numbers">'+amount(i.unitPrice)+'</td>'+
  (invoice.issuer.vatPayer?'<td class="numbers">'+text(i.vatRate)+' %<br>'+amount(itemTotals(i).vat)+'</td>':'')+
  '<td class="numbers">'+amount(itemTotals(i).total)+'</td></tr>').join('')
 const spayd=spaydPaymentString(invoice)
 let qr=''
 if(spayd){
  const [{createElement},{renderToStaticMarkup},{QRCodeSVG}]=await Promise.all([
   import('react'),import('react-dom/server'),import('qrcode.react'),
  ])
  qr=renderToStaticMarkup(createElement(QRCodeSVG,{value:spayd,size:148,level:'M',marginSize:2}))
 }
 // Uživatelské hodnoty se serializují pouze jako escapovaný text, nikdy HTML.
 return '<!doctype html><html lang="cs"><head><meta charset="utf-8">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src '+text("'none'")+"; img-src data:; font-src data:; style-src "+text("'unsafe-inline'")+'">'+
  '<style>'+tokens+await fontCss()+CSS+'</style></head><body data-app="ws">'+
  '<div class="brand">'+(logo?'<img alt="'+text(brand.name)+'" src="'+logo+'">':'<div class="tiles"><i></i><i></i><i></i><i></i></div>')+
  '<div><small>'+text(brand.name)+'</small><h1>Faktura '+num(invoice.number)+'</h1></div></div>'+
  '<div class="parties"><section><small>Dodavatel</small>'+party(invoice.issuer)+'</section><section><small>Odběratel</small>'+party(invoice.counterparty)+'</section></div>'+
  '<p>Vystaveno '+num(formatDayShort(invoice.issuedOn))+' · Splatnost '+num(formatDayShort(invoice.dueOn))+'</p>'+
  (invoice.issuer.vatPayer?'<p>Datum uskutečnění plnění '+num(formatDayShort(invoice.suppliedOn))+'</p>':'')+
  '<table><thead><tr><th>Položka</th><th>Počet</th><th>Cena bez DPH</th>'+(invoice.issuer.vatPayer?'<th>DPH</th>':'')+'<th>Celkem</th></tr></thead><tbody>'+rows+'</tbody></table>'+
  (invoice.issuer.vatPayer?'<p>Základ daně '+amount(invoice.items.reduce((sum,i)=>sum+itemTotals(i).net,0))+' · DPH '+amount(invoice.items.reduce((sum,i)=>sum+itemTotals(i).vat,0))+'</p>':'')+
  '<div class="total">Celkem k úhradě <strong class="numbers">'+amount(invoice.amount)+'</strong></div>'+
  (invoice.issuer.bank?'<p>Účet: '+num(invoice.issuer.bank)+'</p>':'')+
  '<p>Variabilní symbol: '+num(invoice.number.replace(/\\D/g,''))+'</p>'+
  (qr?'<section class="payment-qr"><div><h2>Zaplatit QR kódem</h2><p>Částka '+amount(invoice.amount)+'</p><p>Účet '+num(invoice.issuer.bank)+'</p><p>Variabilní symbol '+num(invoice.number.replace(/\\D/g,''))+'</p></div>'+qr+'</section>':'')+
  (invoice.paidOn?'<p>Zaplaceno '+text(formatDayShort(invoice.paidOn))+'</p>':'')+
  '<p class="foot">'+text(invoice.note)+'</p>'+(!invoice.issuer.vatPayer?'<p class="foot">Dodavatel není plátce DPH.</p>':'')+'</body></html>'
}

export async function renderInvoicePdf(invoice:Invoice,brand:{name:string;logo:string|null}) {
 const puppeteer=(await import('puppeteer-core')).default
 const chromium=process.env.VERCEL?(await import('@sparticuz/chromium')).default:null
 const browser=await puppeteer.launch({executablePath:chromium?await chromium.executablePath(path.join(process.cwd(),'node_modules/@sparticuz/chromium/bin')):process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:chromium?chromium.args:[],headless:true})
 try {
  const page=await browser.newPage();await page.setJavaScriptEnabled(false);await page.setRequestInterception(true)
  page.on('request',r=>{void (r.url().startsWith('data:')?r.continue():r.abort())})
  await page.setContent(await invoiceHtml(invoice,brand),{waitUntil:'load',timeout:20000})
  await page.evaluate(()=>document.fonts.ready)
  return Buffer.from(await page.pdf({format:'A4',printBackground:true,timeout:20000}))
 }finally{await browser.close()}
}
