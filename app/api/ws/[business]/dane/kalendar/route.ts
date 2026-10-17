import { NextResponse } from 'next/server'
import { requireWorkspace,requireBusiness } from '@/lib/ws/context'
import { getEnabledModules } from '@/lib/ws/today'
import { getTaxSettings } from '@/lib/ws/money/data'
import { taxCalendar } from '@/lib/ws/money/reminders'
import { pragueToday } from '@/lib/ws/time'
export async function GET(_req:Request, props:{params: Promise<{business:string}>}) {
 const params = await props.params
 const ctx=await requireWorkspace(),business=await requireBusiness(ctx,params.business)
 if(!(await getEnabledModules(ctx,business)).has('taxes'))return new NextResponse('Tahle funkce je vypnutá.',{status:404})
 const calendar=taxCalendar(pragueToday(),await getTaxSettings(ctx),ctx.accountId)
 return new NextResponse(calendar,{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="danove-terminy.ics"','Cache-Control':'private, no-store'}})
}
