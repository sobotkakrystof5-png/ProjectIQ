import type { IndustryTemplate } from './types'

export const autoservis: IndustryTemplate = {
  key: 'autoservis',
  label: 'Autoservis',
  modules: ['calendar', 'jobs', 'reminders'],
  services: [
    { name: 'Servisní prohlídka', durationMin: 120, price: null },
    { name: 'Přezutí pneumatik', durationMin: 45, price: null },
    { name: 'Příprava na STK', durationMin: 90, price: null },
    { name: 'Oprava', durationMin: 180, price: null },
  ],
  fields: [
    { key: 'auto', label: 'Značka a model auta', type: 'text', required: true, showOnWeb: true },
    { key: 'spz', label: 'SPZ', type: 'text', required: false, showOnWeb: true },
    { key: 'najeto_km', label: 'Najeto km', type: 'number', required: false, showOnWeb: true },
  ],
  // auto stojí v servisu i přes víc dní, proto stav V servisu
  stages: [
    { name: 'Nová', type: 'new' },
    { name: 'Objednáno', type: 'in_progress' },
    { name: 'V servisu', type: 'in_progress' },
    { name: 'Připraveno k vyzvednutí', type: 'done' },
    { name: 'Zaplaceno', type: 'paid' },
    { name: 'Zrušeno', type: 'cancelled' },
  ],
  segments: { newDays: 90, regularMinVisits: 2, regularWindowDays: 730, dormantFactor: 2, dormantMinDays: 365 },
  loyalty: { stampsNeeded: 5, counts: 'visit_paid' },
}
