import type { IndustryTemplate } from './types'

// Rezervace stolu: host vybere čas z otevírací doby, řekne počet osob a příležitost.
// Víc stolů najednou = pracovníci v Nastavení (každý stůl má v kalendáři vlastní sloupec).
export const kavarnaRestaurace: IndustryTemplate = {
  key: 'kavarna-restaurace',
  label: 'Kavárna a restaurace',
  modules: ['calendar', 'reminders'],
  note: 'Každý stůl můžete vést jako samostatný sloupec v kalendáři. Přidáte je v Nastavení jako pracovníky.',
  services: [
    { name: 'Rezervace stolu', durationMin: 90, price: null },
    { name: 'Oslava nebo firemní akce', durationMin: 180, price: null },
    { name: 'Degustační menu', durationMin: 150, price: null },
  ],
  fields: [
    { key: 'pocet_osob', label: 'Počet osob', type: 'number', required: true, showOnWeb: true },
    {
      key: 'prilezitost',
      label: 'Příležitost',
      type: 'choice',
      required: false,
      options: ['Běžná návštěva', 'Oslava', 'Firemní akce', 'Něco jiného'],
      showOnWeb: true,
    },
  ],
  stages: [
    { name: 'Nová', type: 'new' },
    { name: 'Potvrzeno', type: 'in_progress' },
    { name: 'Proběhlo', type: 'done' },
    { name: 'Zrušeno', type: 'cancelled' },
  ],
  // host se vrací po týdnech až měsících
  segments: { newDays: 60, regularMinVisits: 3, regularWindowDays: 365, dormantFactor: 2, dormantMinDays: 120 },
  loyalty: { stampsNeeded: 10, counts: 'visit_paid' },
}
