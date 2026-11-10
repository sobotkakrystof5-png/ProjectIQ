import type { Metadata } from 'next'
import { AuthPage, type AuthSearchParams } from '@/components/ws/auth/auth-page'
import { WS_AUTH_PATHS, WS_HOME_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Přihlášení' }

// Přihlášení e-mailem a heslem nebo přes Google (Supabase Auth, R-080).
export default function Page({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthPage mode="sign-in" paths={WS_AUTH_PATHS} defaultNext={WS_HOME_PATH} searchParams={searchParams} />
}
