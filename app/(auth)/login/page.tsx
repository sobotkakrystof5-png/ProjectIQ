import { redirect } from 'next/navigation'

import { getAdminSession } from '@/lib/auth'

import { LoginForm } from './login-form'

/** Přihlášený admin na /login nemá co dělat — pustíme ho dovnitř. */
export default async function LoginPage() {
  if (await getAdminSession()) redirect('/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-navy-600 to-navy-800 rounded-box flex items-center justify-center shadow-md mb-4">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.5" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-xl font-semibold text-navy-800 tracking-tight">ZakazIQ</span>
        </div>

        <LoginForm />
      </div>
    </div>
  )
}
