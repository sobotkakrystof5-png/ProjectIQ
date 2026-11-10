import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { SecuritySettings } from '@/components/auth/security-settings'
import { requireIdentity } from '@/lib/ws/context'
import { WS_HOME_PATH, WS_SECURITY_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Přihlášení a zabezpečení' }

// Přihlášení a zabezpečení (R-081) — pro každého, kdo se do Workspace
// přihlašuje (majitel i pracovník): 2FA, heslo, e-mail, odhlášení všude.
export default async function WsSecurityPage() {
  const identity = await requireIdentity()

  return (
    <main className="mx-auto flex min-h-screen max-w-[880px] flex-col gap-8 bg-ground px-4 py-8 text-ink sm:px-8 lg:py-10">
      <Link
        href={WS_HOME_PATH}
        className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full text-sm text-quiet transition-colors duration-200 ease-zq hover:text-ink"
      >
        <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
        Zpět do aplikace
      </Link>
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Přihlášení a zabezpečení</h1>
        <p className="mt-1 text-[15px] text-quiet">Kdo a jak se dostane k vašemu účtu.</p>
      </div>
      <SecuritySettings signOutTarget="w-prihlaseni" email={identity.email} returnPath={WS_SECURITY_PATH} />
    </main>
  )
}
