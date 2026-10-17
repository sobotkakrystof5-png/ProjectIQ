import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { AccentHeading } from '@/components/ws/brand'
import { BusinessHoursForm, StaffSettings, TimeOffSettings, type StaffItem, type TimeOffItem } from '@/components/ws/settings/team-settings'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { requireBusiness, requireRole, requireWorkspace } from '@/lib/ws/context'
import { rowsToWeek } from '@/lib/ws/hours'
import { navHref } from '@/lib/ws/nav'
import { getSettingsData } from '@/lib/ws/settings'
import { addDays, formatDayShort, formatMinutes, pragueParts, pragueToday } from '@/lib/ws/time'

/** „po 20. 10. – pá 24. 10.“ pro celé dny, jinak s časem. */
function timeOffWhen(startsAt: string, endsAt: string): string {
  const s = pragueParts(startsAt)
  const e = pragueParts(endsAt)
  if (s.minutes === 0 && e.minutes === 0) {
    const last = addDays(e.date, -1)
    return last === s.date ? formatDayShort(s.date) : `${formatDayShort(s.date)} – ${formatDayShort(last)}`
  }
  const start = `${formatDayShort(s.date)} ${formatMinutes(s.minutes)}`
  return e.date === s.date ? `${start}–${formatMinutes(e.minutes)}` : `${start} – ${formatDayShort(e.date)} ${formatMinutes(e.minutes)}`
}

export default async function OpeningHoursPage(props: { params: Promise<{ business: string }> }) {
  const params = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, params.business)
  requireRole(ctx, 'owner')
  const [data, billing] = await Promise.all([getSettingsData(ctx, business), getBillingState(ctx.accountId)])
  const readOnly = !canWrite(billing)

  const businessWeek = rowsToWeek(data.hours.filter((h) => h.staff_id === null))
  const staff: StaffItem[] = data.staff.map((s) => {
    const own = data.hours.filter((h) => h.staff_id === s.id)
    return { id: s.id, name: s.name, active: s.active, shifts: own.length ? rowsToWeek(own) : null }
  })
  const names = new Map(data.staff.map((s) => [s.id, s.name]))
  const timeOff: TimeOffItem[] = data.timeOff.map((x) => ({
    id: x.id,
    who: x.staff_id ? names.get(x.staff_id) ?? 'Pracovník' : 'Celá firma',
    title: x.title ?? 'Volno',
    when: timeOffWhen(x.starts_at, x.ends_at),
  }))

  return <main className="mx-auto flex max-w-[800px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
    <Link href={navHref(business.slug, 'nastaveni')} className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-2 text-[15px] text-quiet hover:text-ink"><ChevronLeft size={18} />Nastavení</Link>
    <AccentHeading>Otevírací doba a pracovníci</AccentHeading>
    <BusinessHoursForm slug={business.slug} week={businessWeek} readOnly={readOnly} />
    <StaffSettings slug={business.slug} staff={staff} businessWeek={businessWeek} readOnly={readOnly} />
    <TimeOffSettings slug={business.slug} items={timeOff} staff={data.staff.filter((s) => s.active)} today={pragueToday()} readOnly={readOnly} />
  </main>
}
