import { PublicPage } from '@/components/ws/email/public-page'

// Neplatný, cizí nebo vypnutý odkaz pod /z (S16): vždy stejná stránka,
// nic neprozradí, jestli záznam existuje.
export default function PublicLinkNotFound() {
  return (
    <PublicPage title="Odkaz neplatí">
      <p className="text-[15px] text-quiet">
        Tenhle odkaz nejde otevřít. Možná je starý, nebo ho firma vypnula. Když něco potřebujete, napište prosím přímo firmě.
      </p>
    </PublicPage>
  )
}
