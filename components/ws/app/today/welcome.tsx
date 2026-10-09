import { EmptyState } from '@/components/ws/brand'
import { WS_FEATURES } from '@/lib/ws/features'
import { CopyOrderLinkButton } from '../copy-order-link'

/**
 * Nový byznys bez dat: jeden úkol místo tří prázdných sloupců (plán, Registrace
 * krok 5). Po návratu z předplatného (`?vitejte=1`) s přivítáním. Dokud není
 * objednávací stránka (S11), odkaz se nenabízí (R-043).
 */
export function TodayWelcome({ welcome, orderUrl }: { welcome: boolean; orderUrl: string }) {
  const title = welcome ? 'Vítejte, všechno je připravené' : 'Zatím tu nic není'
  if (!WS_FEATURES.orderLink) {
    return (
      <EmptyState
        size="large"
        title={title}
        description="Až přijde první poptávka nebo domluvíte termín, uvidíte ho tady. Odkaz na objednání pro zákazníky přidáme spolu s napojením webu."
      />
    )
  }
  return (
    <EmptyState
      size="large"
      title={title}
      description="Pošlete zákazníkům odkaz na objednání, třeba na web nebo do Instagramu. Každá poptávka se pak objeví tady."
      action={<CopyOrderLinkButton url={orderUrl} variant="inverse" size="lg" />}
    />
  )
}
