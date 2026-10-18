'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Label } from '@/components/ui/label'
import { hrefWith } from '@/lib/ws/detail-param'
import { useSlotAdvice } from './use-slot-advice'
import { NativeSelect } from './when-fields'

type Option = { id: string; name: string }

/**
 * Najít volný čas (RD05): vyberete službu (a kdo ji dělá) a hned vidíte
 * nejbližší volné časy podle otevírací doby, směn a už zapsaných termínů,
 * stejným pravidlem jako objednávka na webu. Klik na čas otevře rezervaci
 * s předvyplněným dnem, časem a službou.
 */
export function FindSlotForm({
  slug,
  services,
  staff,
  pathname,
  params,
  settingsHref,
}: {
  slug: string
  services: (Option & { duration_min: number })[]
  staff: Option[]
  pathname: string
  /** Aktuální parametry adresy (zůstanou zachované). */
  params: Record<string, string>
  settingsHref: string
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [staffId, setStaffId] = useState('')
  const service = services.find((s) => s.id === serviceId)
  const { advice, loading } = useSlotAdvice({
    slug,
    at: null,
    durationMin: service ? null : 60,
    serviceId: serviceId || null,
    staffId: staffId || null,
    count: 8,
  })

  const bookHref = (day: string, minutes: number) =>
    hrefWith(pathname, params, {
      detail: 'nova-rezervace',
      den: day,
      cas: String(minutes),
      sluzba: service?.name ?? null,
      pracovnik: staffId || null,
      kdo: null,
      zakaznik: null,
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {services.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="najit-sluzba">Služba</Label>
            <NativeSelect id="najit-sluzba" value={serviceId} onChange={setServiceId}>
              <option value="">Bez služby (1 hodina)</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_min} min
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {staff.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="najit-kdo">Kdo</Label>
            <NativeSelect id="najit-kdo" value={staffId} onChange={setStaffId}>
              <option value="">Kdokoli</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {loading && !advice ? (
          <p className="text-[15px] text-quiet">Hledám volné časy…</p>
        ) : advice && !advice.hoursSet ? (
          <p className="text-[15px] text-quiet">
            Zatím nemáte nastavenou otevírací dobu, takže nevíme, kdy máte volno. Nastavte ji v{' '}
            <Link href={settingsHref} className="font-semibold text-navy-700 underline-offset-4 hover:underline dark:text-navy-200">
              Nastavení
            </Link>
            .
          </p>
        ) : advice && advice.suggestions.length === 0 ? (
          <p className="text-[15px] text-quiet">V nejbližších dnech nevidíme žádný volný čas. Zkuste jinou službu nebo pracovníka.</p>
        ) : advice ? (
          <>
            <p className="font-num text-[11px] uppercase tracking-[0.08em] text-quiet">Nejbližší volné časy</p>
            <ul className="flex flex-wrap gap-2">
              {advice.suggestions.map((s) => (
                <li key={`${s.day}-${s.minutes}`}>
                  <Link
                    href={bookHref(s.day, s.minutes)}
                    scroll={false}
                    className="inline-flex min-h-11 items-center rounded-full border border-input bg-surface px-4 font-num text-sm font-semibold text-ink transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm text-quiet">Klikem otevřete rezervaci s tímto časem.</p>
          </>
        ) : null}
      </div>
    </div>
  )
}
