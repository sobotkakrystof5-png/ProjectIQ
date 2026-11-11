import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { wsFontVariables } from '@/lib/ws/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'ZakazIQ',
  description: 'Správa freelance zakázek — jednoduchá a přehledná',
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
