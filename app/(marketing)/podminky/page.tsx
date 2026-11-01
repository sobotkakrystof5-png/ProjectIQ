import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'
import { LEGAL_ROBOTS } from '@/components/marketing/seo'

// Text [DOPLNIT] — R-023. Do vyplnění textů noindex (S05). Fakta o chování aplikace (S18, R-054) jsou nad zástupným textem.
export const metadata: Metadata = {
  title: 'Obchodní podmínky',
  alternates: { canonical: '/podminky' },
  robots: LEGAL_ROBOTS,
}

const FACTS = [
  'Po zrušení účtu můžete aplikaci používat do konce zaplaceného období a nic dalšího nezaplatíte; za nevyčerpanou část období peníze nevracíme. Potom účet zavřeme. Data účtu necháváme ještě 30 dní, během nich jde účet obnovit. Potom je nevratně smažeme; ze záloh databáze zmizí do [DOPLNIT: délka historie obnovy v Neonu].',
  'Před zrušením i kdykoli jindy si můžete stáhnout všechna data v Účtu (tabulky CSV a faktury v PDF).',
]

export default function Page() {
  return <LegalPage title="Obchodní podmínky" facts={FACTS} />
}
