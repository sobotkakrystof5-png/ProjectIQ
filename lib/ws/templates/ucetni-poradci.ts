import type { IndustryTemplate } from './types'

// Konzultace + zakázka s postupem (daňové přiznání, účetnictví), na konci faktura.
// Bez otevírací doby běží objednávka v režimu navrženého času: klient napíše,
// kdy by se mu to hodilo, a účetní potvrdí nebo nabídne jiný termín (lib/ws/intake).
export const ucetniPoradci: IndustryTemplate = {
  key: 'ucetni-poradci',
  label: 'Účetní a poradci',
  modules: ['calendar', 'jobs', 'invoices'],
  note: 'Klient navrhne čas konzultace a vy ho potvrdíte. Přiznání nebo účetnictví vedete jako zakázku s kroky.',
  services: [
    { name: 'Úvodní konzultace', durationMin: 60, price: null },
    { name: 'Konzultace', durationMin: 45, price: null },
    { name: 'Daňové přiznání', durationMin: 120, price: null },
  ],
  fields: [
    {
      key: 'o_co_jde',
      label: 'O co jde',
      type: 'choice',
      required: true,
      options: ['Daňové přiznání', 'Vedení účetnictví', 'Mzdy', 'Poradenství', 'Něco jiného'],
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
  // klient se vrací jednou za rok (přiznání) nebo každý měsíc (účetnictví)
  segments: { newDays: 180, regularMinVisits: 2, regularWindowDays: 730, dormantFactor: 2, dormantMinDays: 400 },
  loyalty: { stampsNeeded: 5, counts: 'job_done' },
}
