'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import type { Result } from '@/lib/ws/result'

/** „Zpět“ po odmítnutí, zrušení a přesunu (AGENTS.md → B9, prompt S10: 8 s). */
export const UNDO_MS = 8_000

/**
 * Volání server action z tlačítka: čeká, chybu ukáže v toastu, úspěch
 * podle `onDone`. Data obnoví revalidatePath v akci, router.refresh je
 * pojistka pro případ, že akce běžela z jiné stránky než ta otevřená.
 * `refresh: false` ho vynechá (tažení v kalendáři: revalidatePath už vrátil
 * čerstvou stránku v odpovědi akce, druhý požadavek by jen zdržoval).
 */
export function useWsAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    <T,>(call: () => Promise<Result<T>>, onDone?: (data: T) => void, opts: { refresh?: boolean } = {}): Promise<boolean> =>
      new Promise((resolve) => {
        setBusy(true)
        start(async () => {
          try {
            const res = await call()
            if (!res.ok) {
              toast.error(res.error)
              resolve(false)
              return
            }
            onDone?.(res.data)
            if (opts.refresh !== false) router.refresh()
            resolve(true)
          } catch {
            toast.error('Spojení se nepovedlo. Zkuste to prosím znovu.')
            resolve(false)
          } finally {
            setBusy(false)
          }
        })
      }),
    [router],
  )

  return { run, pending: pending || busy }
}

/** Akce s „Zpět“: provede se hned, toast nabídne vrácení. */
export function undoToast(
  title: string,
  undo: () => Promise<Result<unknown>>,
  opts: { done?: string; description?: string; refresh?: () => void } = {},
) {
  toast.success(title, {
    description: opts.description,
    duration: UNDO_MS,
    undo: async () => {
      try {
        const res = await undo()
        if (res.ok) {
          toast.message(opts.done ?? 'Vráceno.')
          opts.refresh?.()
        } else toast.error(res.error)
      } catch {
        toast.error('Spojení se nepovedlo. Zkuste to prosím znovu.')
      }
    },
  })
}
