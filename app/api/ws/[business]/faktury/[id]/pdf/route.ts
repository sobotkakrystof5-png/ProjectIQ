import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBusiness,requireWorkspace } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { getInvoice } from '@/lib/ws/money/data'
import { renderInvoicePdf } from '@/lib/ws/money/pdf'
import { wsDb } from '@/lib/ws/db'
import { hitLimit } from '@/lib/ws/intake/rate-limit'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(_req:Request,{params}:{params:{business:string;id:string}}) {
 const ctx=await requireWorkspace()
 const id=z.string().uuid().safeParse(params.id)
 if(!id.success)return new NextResponse('Faktura tu není.',{status:404})
 const b=await requireBusiness(ctx,params.business)
 if(!(await getEnabledModules(ctx,b)).has('invoices'))return new NextResponse('Faktura tu není.',{status:404})
 const invoice=await getInvoice(ctx,b,id.data)
 if(!invoice)return new NextResponse('Faktura tu není.',{status:404})
 try {
  let pdf:Buffer
  if(invoice.hasPdf){
   const [r]=await wsDb(ctx)`SELECT encode(pdf_data,'base64') AS data FROM ws.invoices WHERE account_id=${ctx.accountId} AND business_id=${b.id} AND id=${id.data}`
   pdf=Buffer.from(String(r.data),'base64')
  }else{
   if(invoice.direction!=='issued')return new NextResponse('U téhle faktury není PDF.',{status:404})
   if(await hitLimit({name:'money-pdf',max:20,windowSec:600},ctx.accountId))return new NextResponse('Zkuste PDF stáhnout za chvíli.',{status:429})
   pdf=await renderInvoicePdf(invoice,{name:b.name,logo:b.logo_url})
  }
  return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('faktura-'+invoice.number+'.pdf'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
 }catch{
  console.error('[ws/money] PDF se nepodařilo připravit.',{accountId:ctx.accountId})
  return new NextResponse('PDF se nepovedlo připravit. Zkuste to znovu.',{status:503})
 }
}
