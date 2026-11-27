import type { Metadata } from 'next'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { WsForgotPasswordForm } from '@/components/ws/auth/auth-forms'

export const metadata: Metadata = { title: 'Nové heslo' }

export default function ZapomenuteHesloPage() {
  return (
    <AuthShell>
      <WsForgotPasswordForm />
    </AuthShell>
  )
}
