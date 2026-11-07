import { VISIT_STAGES } from './common'
import type { IndustryTemplate } from './types'

// Osobní trénink je běžný termín s trenérem. Skupinové lekce (jóga, kruhový trénink)
// majitel vypisuje v kalendáři jako termín s kapacitou (ws.sessions, R-063) — klient
// vidí, kolik míst zbývá, a místo se rezervuje hned. Kolonky navíc tu nejsou potřeba.
export const fitnessLekce: IndustryTemplate = {
  key: 'fitness-lekce',
  label: 'Fitness a lekce',
  modules: ['calendar', 'reminders'],
  note: 'Skupinové lekce vypíšete v kalendáři jako termín s počtem míst. Klienti vidí, kolik míst zbývá.',
  services: [
    { name: 'Osobní trénink', durationMin: 60, price: null },
    { name: 'Jóga', durationMin: 60, price: null },
    { name: 'Kruhový trénink', durationMin: 45, price: null },
  ],
  fields: [],
  stages: VISIT_STAGES,
  // klient chodí každý týden, stálým je po měsíci
  segments: { newDays: 30, regularMinVisits: 4, regularWindowDays: 90, dormantFactor: 2, dormantMinDays: 30 },
  loyalty: { stampsNeeded: 10, counts: 'visit_paid' },
}
