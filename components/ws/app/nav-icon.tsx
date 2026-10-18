import {
  CalendarDays,
  ClipboardList,
  FileText,
  Inbox,
  Landmark,
  Settings,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { NavKey } from '@/lib/ws/nav'

const ICONS: Record<NavKey, LucideIcon> = {
  dnes: Sun,
  poptavky: Inbox,
  kalendar: CalendarDays,
  zakaznici: Users,
  zakazky: ClipboardList,
  faktury: FileText,
  prijmy: Wallet,
  dane: Landmark,
  nastaveni: Settings,
  penize: Wallet,
}

export function NavIcon({ name, size = 22 }: { name: NavKey; size?: number }) {
  const Icon = ICONS[name]
  return <Icon aria-hidden size={size} strokeWidth={1.5} />
}
