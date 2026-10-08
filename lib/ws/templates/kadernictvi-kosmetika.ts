import { VISIT_STAGES } from './common'
import type { IndustryTemplate } from './types'

export const kadernictviKosmetika: IndustryTemplate = {
  key: 'kadernictvi-kosmetika',
  label: 'Kadeřnictví a kosmetika',
  modules: ['calendar', 'reminders'],
  services: [
    { name: 'Dámský střih', durationMin: 60, price: null },
    { name: 'Pánský střih', durationMin: 30, price: null },
    { name: 'Barvení', durationMin: 120, price: null },
    { name: 'Kosmetické ošetření', durationMin: 60, price: null },
  ],
  fields: [
    {
      key: 'delka_vlasu',
      label: 'Délka vlasů',
      type: 'choice',
      required: false,
      options: ['Krátké', 'Střední', 'Dlouhé'],
      showOnWeb: true,
    },
  ],
  stages: VISIT_STAGES,
  // kadeřnice měří v týdnech (plán, Segmenty)
  segments: { newDays: 30, regularMinVisits: 3, regularWindowDays: 365, dormantFactor: 2, dormantMinDays: 56 },
  loyalty: { stampsNeeded: 5, counts: 'visit_paid' },
}
