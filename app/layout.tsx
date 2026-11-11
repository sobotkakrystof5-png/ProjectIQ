import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { Providers } from './providers'
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
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
