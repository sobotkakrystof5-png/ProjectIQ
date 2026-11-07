import 'server-only'
import { INDUSTRY_TEMPLATES, type IndustryTemplate, type WsModule } from '@/lib/ws/templates'
import type { IndustrySummary } from './new-business-wizard'

/** Funkce navíc obyčejnými slovy (v UI „funkce“, ne „moduly“). */
const MODULE_LABELS: Partial<Record<WsModule, string>> = {
  calendar: 'kalendář',
  jobs: 'zakázky',
  loyalty: 'věrnostní karty',
  invoices: 'faktury',
  finance: 'příjmy',
  taxes: 'daně',
  portal: 'stránka pro zákazníky',
  reviews: 'hodnocení',
  reminders: 'připomínky',
}

function summary(t: IndustryTemplate): IndustrySummary {
  const modules = t.modules.map((m) => MODULE_LABELS[m]).filter(Boolean)
  return {
    key: t.key,
    label: t.label,
    modules: modules.length > 0 ? modules.join(', ') : 'poptávky a zákazníci',
    note: t.note ?? null,
    stages: t.stages.map((s) => ({ name: s.name, type: s.type })),
    fields: t.fields.map((f) => ({ label: f.label, type: f.type })),
    services: t.services.map((s) => s.name),
  }
}

/**
 * Náhled šablon oborů pro průvodce Nový byznys. Sestavuje se na serveru —
 * lib/ws/templates táhne DB vrstvu, do prohlížeče jdou jen tahle data.
 */
export function industrySummaries(): IndustrySummary[] {
  return INDUSTRY_TEMPLATES.map(summary)
}
