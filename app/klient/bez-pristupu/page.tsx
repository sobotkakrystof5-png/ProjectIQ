import type { Metadata } from 'next'
import { SignOutButton } from '@clerk/nextjs'
import { AuthShell } from '@/components/ws/auth/auth-shell'

export const metadata: Metadata = { title: 'Bez přístupu' }

export default function BezPristupuPage() {
  return (
    <AuthShell>
      <div className="rounded-box border border-navy-100 bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Tenhle účet zatím nemá přístup</h1>
        <p className="mt-2 text-sm text-quiet">
          Do klientského prostoru se vstupuje přes pozvánku. Otevřete odkaz, který jste dostali, nebo nám napište a pošleme nový.
        </p>
        <SignOutButton>
          <button type="button" className="mt-4 inline-flex min-h-[44px] items-center rounded-chip border border-navy-100 px-4 text-sm font-medium text-ink hover:border-navy-300">
            Odhlásit se
          </button>
        </SignOutButton>
      </div>
    </AuthShell>
  )
}
