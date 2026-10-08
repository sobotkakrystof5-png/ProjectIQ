import { VISIT_STAGES } from './common'
import type { IndustryTemplate } from './types'

// Obor, který v nabídce není: prázdné služby a kolonky, rozumné stavy.
export const vlastni: IndustryTemplate = {
  key: 'vlastni',
  label: 'Jiný obor',
  modules: ['calendar'],
  services: [],
  fields: [],
  stages: VISIT_STAGES,
  segments: { newDays: 60, regularMinVisits: 3, regularWindowDays: 365, dormantFactor: 2, dormantMinDays: 90 },
  loyalty: { stampsNeeded: 5, counts: 'visit_paid' },
}
