import type { Metadata } from 'next'
import { AuthPage, type AuthSearchParams } from '@/components/ws/auth/auth-page'
import { WS_AUTH_PATHS, WS_HOME_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nastavit heslo' }

// Nastavení hesla po kliknutí na odkaz z e-mailu (obnova hesla, pozvánka).
export default function Page({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthPage mode="new-password" paths={WS_AUTH_PATHS} defaultNext={WS_HOME_PATH} searchParams={searchParams} />
}
