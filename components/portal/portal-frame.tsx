import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { Logo } from '@/components/ws/brand'

/** Rámec klientského prostoru: logo, jméno firmy, odhlášení. Obsah drží stránky. */
export function PortalFrame({ clientName, children }: { clientName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-navy-100 bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/klient" className="inline-flex min-h-[44px] items-center" aria-label="ZakazIQ, přehled">
            <Logo size={28} wordmark />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-quiet sm:inline">{clientName}</span>
            <Link href="/klient/zabezpeceni" className="inline-flex min-h-[44px] items-center rounded-chip px-3 text-sm font-medium text-quiet hover:bg-navy-50 hover:text-ink">
              Zabezpečení
            </Link>
            <SignOutButton target="klient" className="inline-flex min-h-[44px] items-center rounded-chip px-3 text-sm font-medium text-quiet hover:bg-navy-50 hover:text-ink">
              Odhlásit
            </SignOutButton>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
