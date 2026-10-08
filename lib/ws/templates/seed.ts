import { q, type WsQuery } from '../db'
import { ALWAYS_ON_MODULES, WS_MODULES, type IndustryTemplate } from './types'

/**
 * Dotazy, které naplní nový byznys podle šablony oboru: funkce, služby,
 * kolonky, stavy, hranice skupin a (vypnutou) věrnost. Spustit přes
 * `wsDb(ctx).batch(...)` v transakci se založením byznysu (S07).
 */
export function templateSeedQueries(
  scope: { accountId: string; businessId: string },
  template: IndustryTemplate,
): WsQuery[] {
  const { accountId, businessId } = scope
  const queries: WsQuery[] = []

  for (const module of WS_MODULES) {
    const enabled = ALWAYS_ON_MODULES.includes(module) || template.modules.includes(module)
    queries.push(q`
      INSERT INTO ws.business_modules (account_id, business_id, module, enabled)
      VALUES (${accountId}, ${businessId}, ${module}, ${enabled})
    `)
  }

  template.services.forEach((s, position) => {
    queries.push(q`
      INSERT INTO ws.services (account_id, business_id, name, duration_min, price, position)
      VALUES (${accountId}, ${businessId}, ${s.name}, ${s.durationMin}, ${s.price}, ${position})
    `)
  })

  template.fields.forEach((f, position) => {
    queries.push(q`
      INSERT INTO ws.field_definitions (account_id, business_id, key, label, type, required, options, position, show_on_web)
      VALUES (${accountId}, ${businessId}, ${f.key}, ${f.label}, ${f.type}, ${f.required},
              ${JSON.stringify(f.options ?? [])}::jsonb, ${position}, ${f.showOnWeb})
    `)
  })

  template.stages.forEach((s, position) => {
    queries.push(q`
      INSERT INTO ws.stages (account_id, business_id, name, type, position)
      VALUES (${accountId}, ${businessId}, ${s.name}, ${s.type}, ${position})
    `)
  })

  const seg = template.segments
  queries.push(q`
    INSERT INTO ws.segment_rules (business_id, account_id, new_days, regular_min_visits, regular_window_days, dormant_factor, dormant_min_days)
    VALUES (${businessId}, ${accountId}, ${seg.newDays}, ${seg.regularMinVisits}, ${seg.regularWindowDays}, ${seg.dormantFactor}, ${seg.dormantMinDays})
  `)

  // Věrnost se zapíná až v Nastavení › Věrnost, kde byznys napíše svou odměnu.
  queries.push(q`
    INSERT INTO ws.loyalty_programs (account_id, business_id, enabled, stamps_needed, counts)
    VALUES (${accountId}, ${businessId}, ${template.modules.includes('loyalty')}, ${template.loyalty.stampsNeeded}, ${template.loyalty.counts})
  `)

  return queries
}
