import { BarChart3, Coins, Handshake, Megaphone, Newspaper, Palette, Rocket, Settings } from 'lucide-react'
import type { ConsultIcon } from '@/lib/ai/consultants'

/** Ikona konzultanta — Lucide, ne emoji (Dílky § Nikdy). */
const ICONS: Record<ConsultIcon, React.ElementType> = {
  megaphone: Megaphone,
  newspaper: Newspaper,
  rocket: Rocket,
  coins: Coins,
  palette: Palette,
  chart: BarChart3,
  settings: Settings,
  handshake: Handshake,
}

export function ConsultantIcon({ icon, size = 16 }: { icon: ConsultIcon; size?: number }) {
  const Icon = ICONS[icon]
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
}
