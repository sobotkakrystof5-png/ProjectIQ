import { EmptyState } from '@/components/ws/brand'
import { CopyOrderLinkButton } from '../copy-order-link'

/**
 * Nový byznys bez dat: jeden úkol místo tří prázdných sloupců (plán, Registrace
 * krok 5). Po návratu z předplatného (`?vitejte=1`) s přivítáním.
 */
export function TodayWelcome({ welcome, orderUrl }: { welcome: boolean; orderUrl: string }) {
  return (
    <EmptyState
      size="large"
      title={welcome ? 'Vítejte, všechno je připravené' : 'Zatím tu nic není'}
      description="Pošlete zákazníkům odkaz na objednání, třeba na web nebo do Instagramu. Každá poptávka se pak objeví tady."
      action={<CopyOrderLinkButton url={orderUrl} variant="inverse" size="lg" />}
    />
  )
}
