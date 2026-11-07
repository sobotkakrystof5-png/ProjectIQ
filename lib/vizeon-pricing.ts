// VIZEON ceník — jediný zdroj cen pro kalkulačku i oporu pro hovor.
// Cenu měň jen tady, jinak by v hovoru zazněla jiná částka než v kalkulačce.

export type PricePreset = {
  label: string
  items: { name: string; price: number }[]
}

export const WEB_PACKAGES = [
  { label: 'Online Vizitka', name: 'Online Vizitka (web)', price: 7499 },
  { label: 'Promo Page', name: 'Promo Page (web)', price: 9999 },
  { label: 'Pro Web', name: 'Pro Web (kompletní web)', price: 14999 },
] as const

export const CLIENT_PRESETS: PricePreset[] = [
  ...WEB_PACKAGES.map(p => ({ label: p.label, items: [{ name: p.name, price: p.price }] })),
  { label: 'Slide Deck Standard', items: [{ name: 'Slide Deck Standard (prezentace)', price: 1099 }] },
  { label: 'Slide Deck Premium', items: [{ name: 'Slide Deck Premium (prezentace)', price: 3499 }] },
]
