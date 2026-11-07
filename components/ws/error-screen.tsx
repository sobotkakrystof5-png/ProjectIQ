'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ws/brand'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/ws/utils'

/**
 * Obsah `error.tsx` mimo admin: co se stalo, „Zkusit znovu“ a kam dál.
 * Bez kódu chyby a technických slov (skill zakaziq-ux-texty-cs); podrobnosti
 * jsou v logu serveru pod `error.digest`.
 */
export function ErrorScreen({
  description,
  retry,
  home,
  className,
}: {
  /** Druhá věta: koho požádat o pomoc, když to nepůjde ani napodruhé. */
  description: string
  retry: () => void
  /** Odkaz na bezpečné místo (Dnes, úvodní stránka). */
  home?: { href: string; label: string }
  className?: string
}) {
  return (
    <div role="alert" className={cn('mx-auto w-full max-w-[640px] px-4 py-10 sm:px-6', className)}>
      <EmptyState
        title="Stránka se teď nenačetla"
        description={description}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>Zkusit znovu</Button>
            {home && (
              <Link href={home.href} className={buttonVariants({ variant: 'outline' })}>
                {home.label}
              </Link>
            )}
          </div>
        }
      />
    </div>
  )
}

/** Kontakt na podporu ZakazIQ (R-065). */
export const SUPPORT_HINT = 'Zkuste to prosím znovu. Když to nepůjde ani za chvíli, napište nám na info@vizeon.cz.'

/** Pro zákazníky firem (/r, /z): pomoc patří firmě, ne ZakazIQ. */
export const BUSINESS_HINT = 'Zkuste to prosím znovu. Když to nepůjde ani za chvíli, napište nebo zavolejte přímo firmě.'
