import type { Metadata } from 'next'
import { PublicPage } from '@/components/ws/email/public-page'
import { UnsubscribeForm } from '@/components/ws/email/unsubscribe-form'
import { customerLinkBusiness } from '@/lib/ws/email/public-links'
import { verifyLink } from '@/lib/ws/email/links'

// Odhlášení z e-mailu (S15). Otevření nic nemění, odhlašuje až tlačítko.
// Pošta, která umí odhlášení jedním klikem, volá …/jedno-kliknuti (RFC 8058).

export const metadata: Metadata = { title: 'Odhlášení', referrer: 'no-referrer' }

export default async function UnsubscribePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  const token = params.token
  if (verifyLink(token, 'n')) {
    return (
      <PublicPage title="Novinky ZakazIQ">
        <p className="text-[15px] text-quiet">Nechcete dostávat e-maily o tom, co jsme v aplikaci vylepšili? Upozornění na platby a bezpečnost chodí dál.</p>
        <UnsubscribeForm token={token} />
      </PublicPage>
    )
  }
  const info = await customerLinkBusiness(token).catch(() => null)
  if (!info) {
    return (
      <PublicPage title="Odkaz neplatí">
        <p className="text-[15px] text-quiet">Tenhle odkaz nejde použít. Když vám chodí nechtěné zprávy, odpovězte prosím přímo na ně.</p>
      </PublicPage>
    )
  }
  if (info.unsubscribed) {
    return (
      <PublicPage title="Už jste odhlášení">
        <p className="text-[15px] text-quiet">Nabídky{info.businessName ? ` od ${info.businessName}` : ''} vám už nechodí.</p>
      </PublicPage>
    )
  }
  return (
    <PublicPage title="Odhlásit z nabídek">
      <p className="text-[15px] text-quiet">
        Nechcete dostávat nabídky{info.businessName ? ` od ${info.businessName}` : ''}? Potvrzení a připomínky vašich termínů vám chodit budou dál.
      </p>
      <UnsubscribeForm token={token} />
    </PublicPage>
  )
}
