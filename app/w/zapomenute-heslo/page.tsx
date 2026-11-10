import type { Metadata } from 'next'
import { AuthPage, type AuthSearchParams } from '@/components/ws/auth/auth-page'
import { WS_AUTH_PATHS, WS_HOME_PATH } from '@/lib/ws/paths'

export const metadata: Metadata = { title: 'Nové heslo' }

// Žádost o odkaz na nové heslo. Odkaz vede přes /auth/callback na /w/nove-heslo.
export default function Page({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthPage mode="reset" paths={WS_AUTH_PATHS} defaultNext={WS_HOME_PATH} searchParams={searchParams} />
}
