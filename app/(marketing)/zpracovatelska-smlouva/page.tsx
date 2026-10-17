import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/legal-page'
import { LEGAL_ROBOTS } from '@/components/marketing/seo'

// Text [DOPLNIT] — R-023. Do vyplnění textů noindex (S05). Fakta o chování aplikace (S18, R-054) jsou nad zástupným textem.
export const metadata: Metadata = {
  title: 'Zpracovatelská smlouva',
  alternates: { canonical: '/zpracovatelska-smlouva' },
  robots: LEGAL_ROBOTS,
}

const FACTS = [
  'Na žádost vašeho zákazníka ho smažete v jeho kartě. Kontakty, poznámky, věrnost a hodnocení zmizí hned, v historii zůstane „Smazaný zákazník“.',
  'Vystavené faktury smazaného zákazníka zůstanou s povinnými údaji 10 let od konce roku vystavení (zákon o DPH, zákon o účetnictví), potom je anonymizujeme.',
  'Záznam o zpracování osobních údajů najdete v aplikaci v Účtu.',
]

export default function Page() {
  return <LegalPage title="Zpracovatelská smlouva" facts={FACTS} />
}
