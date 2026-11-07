'use client'

import { BUSINESS_HINT, ErrorScreen } from '@/components/ws/error-screen'

// Odkazy z e-mailů a portál zákazníka (/z/[token]): pomoc patří firmě.
export default function PublicLinkError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="min-h-screen bg-ground">
      <ErrorScreen description={BUSINESS_HINT} retry={retry} className="pt-16" />
    </div>
  )
}
