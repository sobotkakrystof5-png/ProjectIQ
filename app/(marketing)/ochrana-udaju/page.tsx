import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

// Text [DOPLNIT] — R-023. Indexování řeší S05.
export const metadata: Metadata = { title: 'Ochrana údajů · ZakazIQ' }

export default function Page() {
  return <LegalPage title="Ochrana osobních údajů" />
}
