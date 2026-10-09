import {
  CalendarDays,
  CircleUser,
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

const ICONS: Record<NavKey | 'penize' | 'ucet', LucideIcon> = {
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
  ucet: CircleUser,
}

export function NavIcon({ name, size = 22 }: { name: NavKey | 'penize' | 'ucet'; size?: number }) {
  const Icon = ICONS[name]
  return <Icon aria-hidden size={size} strokeWidth={1.5} />
}
