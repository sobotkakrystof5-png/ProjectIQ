import { ADDRESS_FIELD } from './common'
import type { IndustryTemplate } from './types'

export const studnarstvi: IndustryTemplate = {
  key: 'studnarstvi',
  label: 'Studnařství',
  modules: ['calendar', 'jobs'],
  services: [
    { name: 'Obhlídka pozemku', durationMin: 60, price: null },
    { name: 'Vrtání studny', durationMin: 480, price: null },
    { name: 'Čištění studny', durationMin: 240, price: null },
  ],
  fields: [
    { ...ADDRESS_FIELD, label: 'Adresa pozemku' },
    {
      key: 'typ_prace',
      label: 'Co potřebujete',
      type: 'choice',
      required: true,
      options: ['Nová studna', 'Prohloubení studny', 'Čištění studny', 'Něco jiného'],
      showOnWeb: true,
    },
    {
      key: 'pristup_technika',
      label: 'Dostane se na pozemek technika?',
      type: 'select',
      required: false,
      options: ['Ano', 'Ne', 'Nevím'],
      showOnWeb: true,
    },
  ],
  stages: [
    { name: 'Poptávka', type: 'new' },
    { name: 'Obhlídka', type: 'in_progress' },
    { name: 'Nabídka odeslaná', type: 'in_progress' },
    { name: 'Vrtání', type: 'in_progress' },
    { name: 'Hotovo', type: 'done' },
    { name: 'Zaplaceno', type: 'paid' },
    { name: 'Zrušeno', type: 'cancelled' },
  ],
  // studnař měří v letech (plán, Segmenty)
  segments: { newDays: 365, regularMinVisits: 2, regularWindowDays: 1825, dormantFactor: 2, dormantMinDays: 730 },
  loyalty: { stampsNeeded: 3, counts: 'job_done' },
}
