import type { Metadata } from 'next'
import { AuthPage, type AuthSearchParams } from '@/components/ws/auth/auth-page'
import { PORTAL_AUTH_PATHS, PORTAL_HOME_PATH } from '@/lib/portal/paths'

export const metadata: Metadata = { title: 'Nové heslo' }

// Žádost o odkaz na nové heslo do klientského prostoru.
export default function Page({ searchParams }: { searchParams: AuthSearchParams }) {
  return <AuthPage mode="reset" paths={PORTAL_AUTH_PATHS} defaultNext={PORTAL_HOME_PATH} searchParams={searchParams} />
}
