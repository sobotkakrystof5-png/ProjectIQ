import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/auth'
import { safeNextPath } from '@/lib/auth/redirect'
import { LoginForm } from './login-form'

// Přihlášení do admin konzole (R-080: Supabase Auth). Přihlášený admin jde rovnou dál.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const next = safeNextPath(typeof sp.next === 'string' ? sp.next : null, '/dashboard')
  if (await getAdminSession()) redirect(next)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 brand-gradient rounded-2xl flex items-center justify-center shadow-md mb-4">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-xl font-semibold text-brand-800 tracking-tight">ZakazIQ</span>
        </div>

        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground mb-1">Přihlásit se</h1>
          <p className="text-sm text-muted-foreground mb-6">Správa tvých zakázek</p>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  )
}
