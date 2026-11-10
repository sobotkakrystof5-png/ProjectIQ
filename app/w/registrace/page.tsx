import type { Metadata } from 'next'
import { AuthPage, type AuthSearchParams } from '@/components/ws/auth/auth-page'
import { WS_AUTH_PATHS, WS_ONBOARDING_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Registrace' }

// Registrace e-mailem a heslem nebo přes Google. Po potvrzení e-mailu průvodce /w/novy.
export default function Page({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthPage mode="sign-up" paths={WS_AUTH_PATHS} defaultNext={WS_ONBOARDING_PATH} searchParams={searchParams} />
}
