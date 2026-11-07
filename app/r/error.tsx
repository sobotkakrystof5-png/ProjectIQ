'use client'

import { BUSINESS_HINT, ErrorScreen } from '@/components/ws/error-screen'

// Objednávací stránka a widget: zákazník firmy, pomoc patří firmě.
export default function OrderError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-ground">
      <ErrorScreen description={BUSINESS_HINT} retry={retry} className="pt-16" />
    </div>
  )
}
