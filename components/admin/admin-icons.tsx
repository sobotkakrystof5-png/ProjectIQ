import {
  Bell, Bot, Building2, CalendarDays, CircleCheck, FileText, Inbox, Layers, ListChecks, Megaphone,
  MessageSquarePlus, MessagesSquare, Mic, PhoneCall, Receipt, Rocket, Sun, Tag, UserCircle, Users, Wallet, FolderOpen,
  type LucideIcon,
} from 'lucide-react'
import type { NavIcon } from '@/lib/admin-nav'

const ICONS: Record<NavIcon, LucideIcon> = {
  today: Sun,
  projects: FolderOpen,
  done: CircleCheck,
  requests: MessageSquarePlus,
  inbox: Inbox,
  calendar: CalendarDays,
  calls: PhoneCall,
  contacts: Users,
  invoices: FileText,
  costs: Receipt,
  finance: Wallet,
  clients: Building2,
  news: Megaphone,
  personal: Layers,
  startup: Rocket,
  bell: Bell,
  profile: UserCircle,
  assistant: Bot,
  services: ListChecks,
  messages: MessagesSquare,
  voice: Mic,
  offers: Tag,
}

export function NavGlyph({ name, size = 18 }: { name: NavIcon; size?: number }) {
  const Icon = ICONS[name]
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
}
