import type { Metadata, Viewport } from 'next'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import { headers } from 'next/headers'
import '../ws-tokens.css'

export const metadata: Metadata = {
  title: { default: 'Váš projekt', template: '%s · ZakazIQ' },
  // Za přihlášením, do vyhledávačů nepatří.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#f4f6fb',
  viewportFit: 'cover',
}

// CSP na /klient je vynucená s nonce z proxy.ts (stejně jako /w): nonce dostanou
// jen dynamicky renderované stránky.
export const dynamic = 'force-dynamic'

// Klientský prostor (KP05). Přihlášení přes Supabase Auth (R-080, hlídá
// proxy.ts); ke které firmě člověk patří, určuje tabulka portal.members.
export default async function KlientLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <WsRoot fontClassName={wsFontVariables} nonce={nonce}>
      {children}
    </WsRoot>
  )
}
