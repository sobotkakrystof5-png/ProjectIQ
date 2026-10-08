import type { Metadata } from 'next'
import { ComingSoon } from '@/components/ws/coming-soon'

export const metadata: Metadata = { title: 'Přihlášení' }

// Zástupná stránka — přihlášení přes Clerk postaví S07 (R-017, AGENTS.md → B4).
export default function PrihlaseniPage() {
  return (
    <ComingSoon
      title="Přihlášení zatím nejde"
      description="Aplikace se ještě staví. Napište mi a ozvu se, jakmile se půjde přihlásit."
    />
  )
}
