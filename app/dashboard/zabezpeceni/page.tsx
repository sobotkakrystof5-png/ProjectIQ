import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SecuritySettings } from '@/components/auth/security-settings'
import { getAdminSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Přihlášení a zabezpečení' }

// Zabezpečení admin účtu (R-081). Dvoufázové ověření je povinné — poslední
// zařízení nejde odebrat. E-mail admina určuje ADMIN_EMAIL, ne formulář.
export default async function AdminSecurityPage() {
  const session = await getAdminSession()
  if (!session) redirect('/login?next=/dashboard/zabezpeceni')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 font-ws sm:px-6 lg:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Přihlášení a zabezpečení</h1>
        <p className="mt-1 text-sm text-quiet">Administrace: heslo + kód z aplikace. Přidejte si i záložní zařízení.</p>
      </div>
      <SecuritySettings signOutTarget="admin" email={session.user.email} requireFactor allowEmailChange={false} returnPath="/dashboard/zabezpeceni" />
    </div>
  )
}
