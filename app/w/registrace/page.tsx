import type { Metadata } from 'next'
import { ComingSoon } from '@/components/ws/coming-soon'

export const metadata: Metadata = { title: 'Registrace' }

// Zástupná stránka — registraci přes Clerk postaví S07 (R-017, AGENTS.md → B4).
export default function RegistracePage() {
  return (
    <ComingSoon
      title="Registraci právě dokončuji"
      description="Zatím se zaregistrovat nejde. Napište mi a ozvu se, jakmile to půjde."
    />
  )
}
