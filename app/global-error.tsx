'use client'

import { ErrorScreen, SUPPORT_HINT } from '@/components/ws/error-screen'
import { wsFontVariables } from '@/lib/ws/fonts'
import './globals.css'
import './ws-tokens.css'

// Chyba v kořenovém layoutu (celé repo, i admin). Nahrazuje kořenový layout,
// proto vlastní <html>, <body>, styly a tokeny Dílků (jinak by byla anglická
// výchozí stránka Nextu bez stylů).
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="cs">
      <body>
        <title>Stránka se nenačetla · ZakazIQ</title>
        <div data-app="ws" className={`${wsFontVariables} min-h-screen bg-ground text-ink antialiased`}>
          <ErrorScreen description={SUPPORT_HINT} retry={retry} home={{ href: '/', label: 'Na úvodní stránku' }} className="pt-16" />
        </div>
      </body>
    </html>
  )
}
