import type { TemplateField, TemplateStage } from './types'

// Stavy pro obory, kde se chodí na termín (kadeřnictví, autoservis, úklid).
export const VISIT_STAGES: TemplateStage[] = [
  { name: 'Nová', type: 'new' },
  { name: 'Objednáno', type: 'in_progress' },
  { name: 'Hotovo', type: 'done' },
  { name: 'Zaplaceno', type: 'paid' },
  { name: 'Zrušeno', type: 'cancelled' },
]

export const ADDRESS_FIELD: TemplateField = {
  key: 'adresa',
  label: 'Adresa',
  type: 'address',
  required: true,
  showOnWeb: true,
}

export const PHOTOS_FIELD: TemplateField = {
  key: 'fotky',
  label: 'Fotky',
  type: 'file',
  required: false,
  showOnWeb: true,
}
