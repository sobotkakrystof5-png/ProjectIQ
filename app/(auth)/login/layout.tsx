// /login musí být dynamický: jen dynamická stránka dostane od Nextu nonce
// z CSP a vynucená CSP adminu (S19, DECISIONS #015) by jinak zablokovala
// skripty přihlášení. Stránka sama je klientská komponenta, proto layout.
export const dynamic = 'force-dynamic'

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
