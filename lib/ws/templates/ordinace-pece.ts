import { VISIT_STAGES } from './common'
import type { IndustryTemplate } from './types'

// Fyzioterapie, masáže, soukromá ordinace: klient vybere ošetření, délku a terapeuta.
// Kolonka „Co vás trápí“ je dobrovolná — zdravotní údaj nikdo nevyžaduje.
export const ordinacePece: IndustryTemplate = {
  key: 'ordinace-pece',
  label: 'Ordinace a péče',
  modules: ['calendar', 'reminders'],
  services: [
    { name: 'Vstupní vyšetření', durationMin: 60, price: null },
    { name: 'Fyzioterapie', durationMin: 45, price: null },
    { name: 'Masáž zad', durationMin: 30, price: null },
    { name: 'Celková masáž', durationMin: 60, price: null },
  ],
  fields: [{ key: 'co_vas_trapi', label: 'Co vás trápí', type: 'text', required: false, showOnWeb: true }],
  stages: VISIT_STAGES,
  // série ošetření po týdnu, pak návrat po měsících
  segments: { newDays: 60, regularMinVisits: 3, regularWindowDays: 365, dormantFactor: 2, dormantMinDays: 90 },
  loyalty: { stampsNeeded: 10, counts: 'visit_paid' },
}
