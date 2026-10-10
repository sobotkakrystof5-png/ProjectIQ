import 'server-only'

import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import type { ChangeHours } from './portal-rules'
import { ALWAYS_ON_MODULES, WS_MODULES, type FieldType, type StageType, type WsModule } from './templates/types'

export const MODULE_DETAILS: Record<WsModule, { label: string; text: string; needs?: WsModule }> = {
  requests: { label: 'Poptávky', text: 'Příchozí zprávy a objednávky od zákazníků.' },
  customers: { label: 'Zákazníci', text: 'Kontakty, historie návštěv a souhlasy.' },
  calendar: { label: 'Kalendář', text: 'Termíny, dostupnost a blokace v jednom místě.' },
  jobs: { label: 'Zakázky', text: 'Přehled práce od přijetí po dokončení.' },
  loyalty: { label: 'Věrnost', text: 'Razítka a odměny pro vracející se zákazníky.' },
  invoices: { label: 'Faktury', text: 'Vystavené faktury a jejich stav.' },
  finance: { label: 'Příjmy', text: 'Přijaté platby a přehled peněz.' },
  taxes: { label: 'Daně', text: 'Podklady pro daně z příjmů.', needs: 'finance' },
  portal: { label: 'Klientský portál', text: 'Zákazník dostane odkaz na svůj termín nebo zakázku. Termín si v něm může přesunout.' },
  reviews: { label: 'Hodnocení', text: 'Po dokončení vás zákazník v odkazu ohodnotí od 1 do 10.', needs: 'portal' },
  reminders: { label: 'Připomínky', text: 'Připomene zákazníkovi blížící se termín.', needs: 'calendar' },
}

export type SettingsData = {
  modules: { module: WsModule; enabled: boolean }[]
  services: { id: string; name: string; duration_min: number; price: string | null; currency: string; active: boolean; show_on_web: boolean; position: number; buffer_min: number }[]
  staff: { id: string; name: string; color: string | null; active: boolean; position: number }[]
  hours: { id: string; staff_id: string | null; weekday: number; opens: string; closes: string }[]
  fields: { id: string; key: string; label: string; type: FieldType; required: boolean; options: string[]; help_text: string | null; position: number; show_on_web: boolean; active: boolean }[]
  stages: { id: string; name: string; type: StageType; position: number }[]
}

const rows = <T>(value: WsRow[]): T[] => value as unknown as T[]

export async function getSettingsData(ctx: WsContext, business: WsBusiness): Promise<SettingsData> {
  const [modules, services, staff, hours, fields, stages] = await wsDb(ctx).batch([
    q`SELECT module, enabled FROM ws.business_modules WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}`,
    q`SELECT id, name, duration_min, price, currency, active, show_on_web, position, COALESCE(buffer_min, 0) AS buffer_min FROM ws.services WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT id, name, color, active, position FROM ws.staff WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT id, staff_id, weekday, opens::text, closes::text FROM ws.opening_hours WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY staff_id NULLS FIRST, weekday, opens`,
    q`SELECT id, key, label, type, required, options, help_text, position, show_on_web, active FROM ws.field_definitions WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT id, name, type, position FROM ws.stages WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
  ])
  const enabled = new Map(rows<{ module: WsModule; enabled: boolean }>(modules).map((x) => [x.module, x.enabled]))
  return {
    modules: WS_MODULES.map((module) => ({ module, enabled: ALWAYS_ON_MODULES.includes(module) || enabled.get(module) === true })),
    services: rows<SettingsData['services'][number]>(services),
    staff: rows<SettingsData['staff'][number]>(staff),
    hours: rows<SettingsData['hours'][number]>(hours),
    fields: rows<SettingsData['fields'][number]>(fields).map((x) => ({ ...x, options: Array.isArray(x.options) ? x.options.map(String) : [] })),
    stages: rows<SettingsData['stages'][number]>(stages),
  }
}

export async function setModule(ctx: WsContext, business: WsBusiness, module: WsModule, enabled: boolean): Promise<void> {
  const forced = ALWAYS_ON_MODULES.includes(module) ? true : enabled
  const queries = [q`
    INSERT INTO ws.business_modules (account_id, business_id, module, enabled)
    VALUES (${ctx.accountId}, ${business.id}, ${module}, ${forced})
    ON CONFLICT (business_id, module) DO UPDATE SET enabled = EXCLUDED.enabled
  `]
  const dependency = MODULE_DETAILS[module].needs
  if (forced && dependency) queries.push(q`
    INSERT INTO ws.business_modules (account_id, business_id, module, enabled)
    VALUES (${ctx.accountId}, ${business.id}, ${dependency}, true)
    ON CONFLICT (business_id, module) DO UPDATE SET enabled = true
  `)
  if (!forced && module === 'finance') queries.push(q`
    UPDATE ws.business_modules SET enabled = false
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND module = 'taxes'
  `)
  if (!forced && module === 'portal') queries.push(q`
    UPDATE ws.business_modules SET enabled = false
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND module = 'reviews'
  `)
  if (!forced && module === 'calendar') queries.push(q`
    UPDATE ws.business_modules SET enabled = false
    WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND module = 'reminders'
  `)
  await wsDb(ctx).batch(queries)
}

export async function saveService(ctx: WsContext, business: WsBusiness, input: { id?: string; name: string; duration: number; price: number | null; currency: string; showOnWeb: boolean; buffer: number }): Promise<void> {
  if (input.id) {
    await wsDb(ctx)`UPDATE ws.services SET name = ${input.name}, duration_min = ${input.duration}, price = ${input.price}, currency = ${input.currency}, show_on_web = ${input.showOnWeb}, buffer_min = ${input.buffer} WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${input.id}`
  } else {
    await wsDb(ctx)`INSERT INTO ws.services (account_id, business_id, name, duration_min, price, currency, show_on_web, position, buffer_min) VALUES (${ctx.accountId}, ${business.id}, ${input.name}, ${input.duration}, ${input.price}, ${input.currency}, ${input.showOnWeb}, (SELECT COALESCE(max(position), -1) + 1 FROM ws.services WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}), ${input.buffer})`
  }
}

export async function setServiceActive(ctx: WsContext, business: WsBusiness, id: string, active: boolean): Promise<void> {
  await wsDb(ctx)`UPDATE ws.services SET active = ${active} WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${id}`
}

export async function saveField(ctx: WsContext, business: WsBusiness, input: { id?: string; key: string; label: string; type: FieldType; required: boolean; options: string[]; help: string | null; showOnWeb: boolean }): Promise<void> {
  if (input.id) {
    await wsDb(ctx)`UPDATE ws.field_definitions SET label = ${input.label}, type = ${input.type}, required = ${input.required}, options = ${JSON.stringify(input.options)}::jsonb, help_text = ${input.help}, show_on_web = ${input.showOnWeb} WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${input.id}`
  } else {
    await wsDb(ctx)`INSERT INTO ws.field_definitions (account_id, business_id, key, label, type, required, options, help_text, show_on_web, position) VALUES (${ctx.accountId}, ${business.id}, ${input.key}, ${input.label}, ${input.type}, ${input.required}, ${JSON.stringify(input.options)}::jsonb, ${input.help}, ${input.showOnWeb}, (SELECT COALESCE(max(position), -1) + 1 FROM ws.field_definitions WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}))`
  }
}

export async function saveStage(ctx: WsContext, business: WsBusiness, input: { id?: string; name: string; type: StageType }): Promise<void> {
  if (input.id) await wsDb(ctx)`UPDATE ws.stages SET name = ${input.name}, type = ${input.type} WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${input.id}`
  else await wsDb(ctx)`INSERT INTO ws.stages (account_id, business_id, name, type, position) VALUES (${ctx.accountId}, ${business.id}, ${input.name}, ${input.type}, (SELECT COALESCE(max(position), -1) + 1 FROM ws.stages WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}))`
}

export async function moveAndDeleteStage(ctx: WsContext, business: WsBusiness, id: string, targetId: string): Promise<void> {
  await wsDb(ctx).batch([
    q`UPDATE ws.jobs SET stage_id = ${targetId} WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND stage_id = ${id} AND EXISTS (SELECT 1 FROM ws.stages WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${targetId})`,
    q`DELETE FROM ws.stages WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND id = ${id} AND ${id} <> ${targetId}`,
  ])
}

/** Pravidla klientského portálu (S16) v ws.businesses.settings, ostatní klíče zůstanou. */
export async function savePortalRules(ctx: WsContext, business: WsBusiness, input: { changeHours: ChangeHours; address: string | null }): Promise<void> {
  await wsDb(ctx)`
    UPDATE ws.businesses
    SET settings = settings || jsonb_build_object('portal_change_hours', ${JSON.stringify(input.changeHours)}::jsonb, 'address', ${input.address}::text)
    WHERE account_id = ${ctx.accountId} AND id = ${business.id}`
}

export async function saveAppearance(ctx: WsContext, business: WsBusiness, color: string | null): Promise<void> {
  await wsDb(ctx)`UPDATE ws.businesses SET color = ${color} WHERE account_id = ${ctx.accountId} AND id = ${business.id}`
}
