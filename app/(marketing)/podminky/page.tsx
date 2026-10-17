import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'

// Text [DOPLNIT] — R-023. Indexování řeší S05. Fakta o chování aplikace (S18, R-054) jsou nad zástupným textem.
export const metadata: Metadata = { title: 'Podmínky · ZakazIQ' }

const FACTS = [
  'Po zrušení účtu předplatné hned skončí. Data účtu necháváme 30 dní, během nich jde účet obnovit. Potom je nevratně smažeme; ze záloh databáze zmizí do [DOPLNIT: délka historie obnovy v Neonu].',
  'Před zrušením i kdykoli jindy si můžete stáhnout všechna data v Účtu (tabulky CSV a faktury v PDF).',
]

export default function Page() {
  return <LegalPage title="Obchodní podmínky" facts={FACTS} />
}
