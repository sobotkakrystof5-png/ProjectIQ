import type { BellItem, BellNews } from '@/components/ws/app/notifications-bell'

// Doplňky kostry, bez kterých se obrazovka obejde (RD02): zvonek, novinky
// a názvy služeb pro ⌘K. Typy a prázdná hodnota jsou zvlášť, aby je směla
// importovat i klientská kostra (`lib/ws/chrome.ts` je jen pro server).

export type FrameChrome = {
  services: string[]
  bell: { items: BellItem[]; unread: number; news: BellNews[]; newsUnseen: boolean }
}

export const EMPTY_CHROME: FrameChrome = {
  services: [],
  bell: { items: [], unread: 0, news: [], newsUnseen: false },
}
