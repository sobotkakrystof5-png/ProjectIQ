import { ADDRESS_FIELD } from './common'
import type { IndustryTemplate } from './types'

export const zamecnictvi: IndustryTemplate = {
  key: 'zamecnictvi',
  label: 'Zámečnictví',
  modules: ['calendar', 'jobs'],
  services: [
    { name: 'Otevření dveří', durationMin: 60, price: null },
    { name: 'Výměna zámku', durationMin: 60, price: null },
    { name: 'Montáž bezpečnostního kování', durationMin: 120, price: null },
  ],
  fields: [
    ADDRESS_FIELD,
    {
      key: 'co_se_stalo',
      label: 'Co potřebujete',
      type: 'choice',
      required: true,
      options: ['Zabouchnuté dveře', 'Výměna zámku', 'Montáž', 'Něco jiného'],
      showOnWeb: true,
    },
    {
      key: 'spech',
      label: 'Jak moc to spěchá',
      type: 'choice',
      required: false,
      options: ['Hned', 'Do pár dní', 'Může počkat'],
      showOnWeb: true,
    },
  ],
  stages: [
    { name: 'Nová', type: 'new' },
    { name: 'Domluveno', type: 'in_progress' },
    { name: 'V práci', type: 'in_progress' },
    { name: 'Hotovo', type: 'done' },
    { name: 'Zaplaceno', type: 'paid' },
    { name: 'Zrušeno', type: 'cancelled' },
  ],
  segments: { newDays: 90, regularMinVisits: 2, regularWindowDays: 730, dormantFactor: 2, dormantMinDays: 365 },
  loyalty: { stampsNeeded: 5, counts: 'job_done' },
}
