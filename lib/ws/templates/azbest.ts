import { ADDRESS_FIELD, PHOTOS_FIELD } from './common'
import type { IndustryTemplate } from './types'

export const azbest: IndustryTemplate = {
  key: 'azbest',
  label: 'Likvidace azbestu',
  modules: ['calendar', 'jobs'],
  services: [
    { name: 'Obhlídka a odběr vzorku', durationMin: 90, price: null },
    { name: 'Odstranění azbestové střechy', durationMin: 480, price: null },
    { name: 'Odstranění azbestových rozvodů', durationMin: 480, price: null },
  ],
  fields: [
    ADDRESS_FIELD,
    {
      key: 'co_odstranit',
      label: 'Co je potřeba odstranit',
      type: 'choice',
      required: true,
      options: ['Střešní krytina', 'Fasáda', 'Rozvody', 'Něco jiného'],
      showOnWeb: true,
    },
    { key: 'plocha_m2', label: 'Přibližná plocha v m²', type: 'number', required: false, showOnWeb: true },
    PHOTOS_FIELD,
  ],
  stages: [
    { name: 'Poptávka', type: 'new' },
    { name: 'Obhlídka', type: 'in_progress' },
    { name: 'Nabídka odeslaná', type: 'in_progress' },
    { name: 'Povolení a ohlášení', type: 'in_progress' },
    { name: 'Odstraňování', type: 'in_progress' },
    { name: 'Hotovo', type: 'done' },
    { name: 'Zaplaceno', type: 'paid' },
    { name: 'Zrušeno', type: 'cancelled' },
  ],
  segments: { newDays: 365, regularMinVisits: 2, regularWindowDays: 1825, dormantFactor: 2, dormantMinDays: 730 },
  loyalty: { stampsNeeded: 3, counts: 'job_done' },
}
