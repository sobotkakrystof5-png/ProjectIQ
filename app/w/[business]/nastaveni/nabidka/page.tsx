import { BusinessHoursForm, StaffSettings, TimeOffSettings, type StaffItem, type TimeOffItem } from '@/components/ws/settings/team-settings'
import { ServiceSettings } from '@/components/ws/settings/service-settings'
import { SettingsPageShell } from '@/components/ws/settings/settings-page-shell'
import { canWrite, getBillingState } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace } from '@/lib/ws/context'
import { rowsToWeek } from '@/lib/ws/hours'
import { getSettingsData } from '@/lib/ws/settings'
import { addDays, formatDayShort, formatMinutes, pragueParts, pragueToday } from '@/lib/ws/time'

function timeOffWhen(startsAt: string, endsAt: string): string {
  const start = pragueParts(startsAt)
  const end = pragueParts(endsAt)
  if (start.minutes === 0 && end.minutes === 0) {
    const last = addDays(end.date, -1)
    return last === start.date ? formatDayShort(start.date) : `${formatDayShort(start.date)} – ${formatDayShort(last)}`
  }
  const from = `${formatDayShort(start.date)} ${formatMinutes(start.minutes)}`
  return end.date === start.date ? `${from}–${formatMinutes(end.minutes)}` : `${from} – ${formatDayShort(end.date)} ${formatMinutes(end.minutes)}`
}

export default async function OfferSettingsPage(props: { params: Promise<{ business: string }> }) {
  const { business: slug } = await props.params
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, slug)
  if (!hasRole(ctx, 'owner')) return <SettingsPageShell businessSlug={slug} title="Nabídka"><p className="text-[15px] text-quiet">Nastavení firmy mění majitel účtu.</p></SettingsPageShell>
  const [data, billing] = await Promise.all([getSettingsData(ctx, business), getBillingState(ctx.accountId)])
  const readOnly = !canWrite(billing)
  const businessWeek = rowsToWeek(data.hours.filter((hour) => hour.staff_id === null))
  const staff: StaffItem[] = data.staff.map((worker) => {
    const own = data.hours.filter((hour) => hour.staff_id === worker.id)
    return { id: worker.id, name: worker.name, color: worker.color, active: worker.active, shifts: own.length ? rowsToWeek(own) : null }
  })
  const names = new Map(data.staff.map((worker) => [worker.id, worker.name]))
  const timeOff: TimeOffItem[] = data.timeOff.map((item) => ({
    id: item.id,
    who: item.staff_id ? names.get(item.staff_id) ?? 'Pracovník' : 'Celá firma',
    title: item.title ?? 'Volno',
    when: timeOffWhen(item.starts_at, item.ends_at),
  }))

  return <SettingsPageShell businessSlug={business.slug} title="Nabídka">
    <nav aria-label="Části nabídky" className="flex flex-wrap gap-2">
      {[['sluzby', 'Služby'], ['oteviraci-doba', 'Otevírací doba'], ['pracovnici', 'Pracovníci']].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-navy-100 bg-surface px-4 text-sm font-medium text-ink hover:bg-navy-50">{label}</a>)}
    </nav>
    <section id="sluzby" className="scroll-mt-6">
      <p className="mb-3 text-[15px] text-quiet">Služby z oborové šablony jsou připravené. Cenu si můžete doplnit později.</p>
      <ServiceSettings slug={business.slug} services={data.services} staff={data.staff.filter((worker) => worker.active)} serviceStaff={data.serviceStaff} readOnly={readOnly} />
    </section>
    <section id="oteviraci-doba" className="scroll-mt-6"><BusinessHoursForm slug={business.slug} week={businessWeek} readOnly={readOnly} /></section>
    <section id="pracovnici" className="scroll-mt-6" aria-label="Pracovníci, směny a volno">
      <StaffSettings slug={business.slug} staff={staff} businessWeek={businessWeek} readOnly={readOnly} />
      <div className="mt-4"><TimeOffSettings slug={business.slug} items={timeOff} staff={data.staff.filter((worker) => worker.active)} today={pragueToday()} readOnly={readOnly} /></div>
    </section>
  </SettingsPageShell>
}
