import { ADDRESS_FIELD, VISIT_STAGES } from './common'
import type { IndustryTemplate } from './types'

export const uklid: IndustryTemplate = {
  key: 'uklid',
  label: 'Úklid',
  modules: ['calendar', 'reminders'],
  services: [
    { name: 'Pravidelný úklid', durationMin: 180, price: null },
    { name: 'Jednorázový úklid', durationMin: 240, price: null },
    { name: 'Úklid po rekonstrukci', durationMin: 480, price: null },
    { name: 'Mytí oken', durationMin: 120, price: null },
  ],
  fields: [
    ADDRESS_FIELD,
    { key: 'plocha_m2', label: 'Přibližná plocha v m²', type: 'number', required: false, showOnWeb: true },
  ],
  stages: VISIT_STAGES,
  segments: { newDays: 30, regularMinVisits: 4, regularWindowDays: 365, dormantFactor: 2, dormantMinDays: 60 },
  loyalty: { stampsNeeded: 10, counts: 'visit_paid' },
}
