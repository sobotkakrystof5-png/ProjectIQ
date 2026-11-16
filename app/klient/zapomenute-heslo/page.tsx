import type { Metadata } from 'next'
import { AuthShell } from '@/components/ws/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/portal/auth-forms'

export const metadata: Metadata = { title: 'Nové heslo' }

export default function ZapomenuteHesloPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  )
}
