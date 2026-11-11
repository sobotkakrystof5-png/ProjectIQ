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

export const AREA_STYLES: Record<LifeArea, string> = {
  'byznys': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'sport / výživa': 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'škola': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'vzdělávání': 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  'osobní': 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
}
