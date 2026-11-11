import {
  Bell, Building2, CalendarDays, CheckCircle2, FileText, Inbox, Layers, Megaphone,
  MessageSquarePlus, PhoneCall, Receipt, Rocket, Star, Sun, UserCircle, Wallet, FolderOpen,
  type LucideIcon,
} from 'lucide-react'
import type { NavIcon } from '@/lib/admin-nav'

const ICONS: Record<NavIcon, LucideIcon> = {
  today: Sun,
  projects: FolderOpen,
  requests: MessageSquarePlus,
  inbox: Inbox,
  done: CheckCircle2,
  rating: Star,
  calendar: CalendarDays,
  calls: PhoneCall,
  invoices: FileText,
  costs: Receipt,
  finance: Wallet,
  clients: Building2,
  news: Megaphone,
  personal: Layers,
  startup: Rocket,
  bell: Bell,
  profile: UserCircle,
}

export function NavGlyph({ name, size = 18 }: { name: NavIcon; size?: number }) {
  const Icon = ICONS[name]
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
}
