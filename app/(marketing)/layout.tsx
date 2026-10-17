import type { Metadata } from 'next'
import { OPEN_GRAPH_BASE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/components/marketing/seo'
import { WsRoot } from '@/components/ws/ws-root'
import { wsFontVariables } from '@/lib/ws/fonts'
import '../ws-tokens.css'
import './landing.css'

// CSP na landing page je vynucená s nonce z proxy.ts (R-033, DECISIONS #007).
// Nonce dostanou jen dynamicky renderované stránky — statická by měla skripty bez nonce.
export const dynamic = 'force-dynamic'

// Výchozí metadata pro všechny marketingové stránky (S05). Ikony a OG obrázek jsou
// souborové konvence v této složce: icon.svg, apple-icon.png, opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { ...OPEN_GRAPH_BASE, title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
}

// Layout landing page — stejné tokeny a písma jako Workspace (design systém Dílky).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <WsRoot fontClassName={wsFontVariables} className="overflow-x-clip">
      <div data-page="landing">{children}</div>
    </WsRoot>
  )
}
