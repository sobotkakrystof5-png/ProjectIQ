import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WS_SIGN_IN_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Pozvánka už neplatí' }

export default function NeplatnaPozvankaPage() {
  return (
    <AuthShell>
      <div className="rounded-box border border-navy-100 bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Pozvánka už neplatí</h1>
        <p className="mt-2 text-sm text-quiet">
          Odkaz se dá použít jen jednou a platí 14 dní. Napište nám na info@vizeon.cz a pošleme vám nový.
        </p>
        <Link href={WS_SIGN_IN_PATH} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-navy-700 underline-offset-4 hover:underline">
          Už mám přístup, přihlásit se
        </Link>
      </div>
    </AuthShell>
  )
}
