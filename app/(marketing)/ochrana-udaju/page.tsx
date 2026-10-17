import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'
import { LEGAL_ROBOTS } from '@/components/marketing/seo'

// Text [DOPLNIT] — R-023. Do vyplnění textů noindex (S05).
export const metadata: Metadata = {
  title: 'Ochrana údajů',
  alternates: { canonical: '/ochrana-udaju' },
  robots: LEGAL_ROBOTS,
}

export default function Page() {
  return <LegalPage title="Ochrana osobních údajů" />
}
