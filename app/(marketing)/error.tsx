'use client'

import { ErrorScreen, SUPPORT_HINT } from '@/components/ws/error-screen'

// Landing page a právní stránky.
export default function MarketingError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-ground">
      <ErrorScreen description={SUPPORT_HINT} retry={retry} home={{ href: '/', label: 'Na úvodní stránku' }} className="pt-16" />
    </div>
  )
}
