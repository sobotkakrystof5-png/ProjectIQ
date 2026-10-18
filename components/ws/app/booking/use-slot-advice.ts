'use client'

import { useEffect, useRef, useState } from 'react'
import { slotAdvice } from '@/app/w/[business]/poptavky/actions'
import type { AdviceDto } from '@/lib/ws/slot-suggest'

export type AdviceQuery = {
  slug: string
  /** Den a čas v Praze; `null` = jen hledání nejbližšího volna. */
  at: { day: string; minutes: number } | null
  durationMin: number | null
  serviceId: string | null
  staffId: string | null
  excludeAppointmentId?: string | null
  count?: number
}

/**
 * Rada k času (volno / kolize / mimo otevírací dobu / nejbližší volné časy)
 * z `slotAdvice`. Dotaz odchází po krátké pauze v zadávání a starší odpověď
 * nikdy nepřepíše novější. Chyba rady nic neblokuje — zápis rozhodne DB.
 */
export function useSlotAdvice(query: AdviceQuery | null): { advice: AdviceDto | null; loading: boolean } {
  const [advice, setAdvice] = useState<AdviceDto | null>(null)
  const [loading, setLoading] = useState(false)
  const latest = useRef(0)

  const key = query
    ? JSON.stringify([query.slug, query.at, query.durationMin, query.serviceId, query.staffId, query.excludeAppointmentId ?? null, query.count ?? 3])
    : null

  useEffect(() => {
    if (!key || !query) {
      setAdvice(null)
      setLoading(false)
      return
    }
    const id = ++latest.current
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await slotAdvice({
          slug: query.slug,
          at: query.at,
          durationMin: query.durationMin,
          serviceId: query.serviceId,
          staffId: query.staffId,
          excludeAppointmentId: query.excludeAppointmentId ?? null,
          count: query.count,
        })
        if (latest.current !== id) return
        setAdvice(res.ok ? res.data : null)
      } catch {
        if (latest.current === id) setAdvice(null)
      } finally {
        if (latest.current === id) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
    // dotaz je plně určený klíčem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { advice, loading }
}
