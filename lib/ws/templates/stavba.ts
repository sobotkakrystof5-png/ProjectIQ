import { ADDRESS_FIELD, PHOTOS_FIELD } from './common'
import type { IndustryTemplate } from './types'

export const stavba: IndustryTemplate = {
  key: 'stavba',
  label: 'Stavba a rekonstrukce',
  modules: ['jobs'],
  services: [
    { name: 'Obhlídka a zaměření', durationMin: 60, price: null },
    { name: 'Rekonstrukce', durationMin: 480, price: null },
  ],
  fields: [
    ADDRESS_FIELD,
    { key: 'druh_prace', label: 'Co potřebujete udělat', type: 'text', required: true, showOnWeb: true },
    { key: 'kdy_zacit', label: 'Kdy byste chtěli začít', type: 'date', required: false, showOnWeb: true },
    PHOTOS_FIELD,
  ],
  stages: [
    { name: 'Poptávka', type: 'new' },
    { name: 'Obhlídka', type: 'in_progress' },
    { name: 'Nabídka odeslaná', type: 'in_progress' },
    { name: 'V realizaci', type: 'in_progress' },
    { name: 'Předáno', type: 'done' },
    { name: 'Zaplaceno', type: 'paid' },
    { name: 'Zrušeno', type: 'cancelled' },
  ],
  segments: { newDays: 365, regularMinVisits: 2, regularWindowDays: 1825, dormantFactor: 2, dormantMinDays: 730 },
  loyalty: { stampsNeeded: 3, counts: 'job_done' },
}
