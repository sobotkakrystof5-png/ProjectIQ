import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'ZakazIQ',
  description: 'Správa freelance zakázek — jednoduchá a přehledná',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
