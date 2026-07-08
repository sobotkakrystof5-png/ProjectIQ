import type { PlanCategory, PlanStatus } from './plany-actions'

export const PLAN_CATEGORIES: PlanCategory[] = ['byznys', 'osobni', 'technologie', 'vzdelavani', 'jine']

export const PLAN_CATEGORY_LABELS: Record<PlanCategory, string> = {
  byznys: 'Byznys',
  osobni: 'Osobní',
  technologie: 'Technologie',
  vzdelavani: 'Vzdělávání',
  jine: 'Jiné',
}

export const PLAN_CATEGORY_STYLES: Record<PlanCategory, string> = {
  byznys: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  osobni: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  technologie: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  vzdelavani: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  jine: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
}

export const PLAN_STATUSES: PlanStatus[] = ['napad', 'analyza', 'rozhodnuto_ano', 'rozhodnuto_ne', 'aktivni']

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  napad: 'Nápad',
  analyza: 'V analýze',
  rozhodnuto_ano: 'Schváleno',
  rozhodnuto_ne: 'Zamítnuto',
  aktivni: 'Aktivní',
}

export const PLAN_STATUS_STYLES: Record<PlanStatus, string> = {
  napad: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
  analyza: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  rozhodnuto_ano: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rozhodnuto_ne: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  aktivni: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
}
