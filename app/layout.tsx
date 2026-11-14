import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { wsFontVariables } from '@/lib/ws/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'ZakazIQ',
  description: 'Správa freelance zakázek — jednoduchá a přehledná',
  // Bez tohohle hledal prohlížeč /favicon.ico a na každé stránce adminu, /login,
  // /p i /h vracel 404 (AD18). Landing i /w si ikony přepisují ve svém layoutu.
  icons: { icon: '/ikony/ikona.svg', apple: '/ikony/apple-touch-icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Písma Dílků definuje <html>, aby na ně dosáhl i `body` v app/globals.css (R-081).
    <html lang="cs" className={wsFontVariables}>
      <body>
        {/* Bez SessionProvideru (AD06): `useSession()` v aplikaci nikdo
            nepoužívá, admin si session čte na serveru. Dřív ho tu měla celá
            aplikace, takže i landing page a Workspace načítaly NextAuth
            a po každém mountu volaly /api/auth/session. */}
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
