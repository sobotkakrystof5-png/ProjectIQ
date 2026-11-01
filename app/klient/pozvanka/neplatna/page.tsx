import type { Metadata } from 'next'
import { AuthShell } from '@/components/ws/auth/auth-shell'

export const metadata: Metadata = { title: 'Pozvánka' }

export default function NeplatnaPozvankaPage() {
  return (
    <AuthShell>
      <div className="rounded-box border border-navy-100 bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Pozvánka už neplatí</h1>
        <p className="mt-2 text-sm text-quiet">
          Odkaz mohl vypršet, být už použitý, nebo patří k jinému e-mailu. Napište nám prosím a pošleme vám nový.
        </p>
      </div>
    </AuthShell>
  )
}
