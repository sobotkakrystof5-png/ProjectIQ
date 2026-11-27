import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WsSignInForm } from '@/components/ws/auth/auth-forms'
import { getWsIdentity } from '@/lib/ws/context'
import { safeWsNext, WS_HOME_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Přihlášení' }

// Přihlášení heslem nebo kódem z e-mailu (R-154). Tentýž účet jako klientský
// prostor. `next` jen uvnitř /w, bez něj /w (poslední byznys).
export default async function PrihlaseniPage({ searchParams }: { searchParams: Promise<{ next?: string; odhlaseno?: string; odkaz?: string }> }) {
  const params = await searchParams
  const next = params.next ? safeWsNext(params.next) : WS_HOME_PATH
  if (await getWsIdentity()) redirect(next)
  return (
    <AuthShell>
      <WsSignInForm
        next={next}
        notice={params.odhlaseno === 'vsude' ? 'Odhlásili jsme vás na všech zařízeních.' : params.odkaz === 'neplatny' ? 'Odkaz z e-mailu už neplatí. Přihlaste se, nebo si pošlete nový kód.' : null}
      />
    </AuthShell>
  )
}
