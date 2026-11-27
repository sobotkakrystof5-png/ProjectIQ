'use client'

import { useEffect } from 'react'
import { markOfferSeenAction } from '@/app/nabidka/[token]/actions'

/**
 * Zapíše, že klient nabídku otevřel. Až v prohlížeči po načtení stránky,
 * ne při otevření odkazu: poštovní filtry odkazy v e-mailech procházejí a
 * jinak by „otevřel" každý robot (stejně jako u dotazníku, R-119).
 * Jednou za návštěvu v téhle záložce.
 */
export function OfferSeen({ token }: { token: string }) {
  useEffect(() => {
    const key = `zakaziq-nabidka-${token}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // Bez úložiště (soukromé okno) se otevření zapíše při každém načtení, nic horšího.
    }
    void markOfferSeenAction(token).catch(() => {})
  }, [token])
  return null
}
