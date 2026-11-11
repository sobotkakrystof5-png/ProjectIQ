export const INCOME_CATEGORIES = [
  'Zakázky',
  'Projekty',
  'Pasivní příjmy',
  'Ostatní',
] as const

export const EXPENSE_CATEGORIES = [
  'Software & nástroje',
  'Marketing',
  'Hardware',
  'Vzdělávání',
  'Osobní',
  'Ostatní',
] as const

export const LIFE_AREAS = [
  'byznys',
  'sport / výživa',
  'škola',
  'vzdělávání',
  'osobní',
] as const

export type LifeArea = (typeof LIFE_AREAS)[number]

export const AREA_LABELS: Record<LifeArea, string> = {
  'byznys': 'Byznys',
  'sport / výživa': 'Sport / výživa',
  'škola': 'Škola',
  'vzdělávání': 'Vzdělávání',
  'osobní': 'Osobní',
}

// Oblast je kategorie, ne stav — rozlišuje ji popisek (AD05, lib/admin-status.ts).
