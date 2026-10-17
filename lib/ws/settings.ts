import 'server-only'

import { q, wsDb, type WsRow } from './db'
import type { WsBusiness, WsContext } from './context'
import type { ChangeHours } from './portal-rules'
import type { HoursRow } from './hours'
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
  /** Kdo kterou službu dělá. Služba bez řádku = dělá ji kdokoli. */
  serviceStaff: { service_id: string; staff_id: string }[]
  /** Dovolené a zavřeno: blokace, které ještě neskončily (staff_id null = celá firma). */
  timeOff: { id: string; staff_id: string | null; title: string | null; starts_at: string; ends_at: string }[]
}

const rows = <T>(value: WsRow[]): T[] => value as unknown as T[]

export async function getSettingsData(ctx: WsContext, business: WsBusiness): Promise<SettingsData> {
  const [modules, services, staff, hours, fields, stages, serviceStaff, timeOff] = await wsDb(ctx).batch([
    q`SELECT module, enabled FROM ws.business_modules WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}`,
    q`SELECT id, name, duration_min, price, currency, active, show_on_web, position, COALESCE(buffer_min, 0) AS buffer_min FROM ws.services WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT id, name, color, active, position FROM ws.staff WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT id, staff_id, weekday, opens::text, closes::text FROM ws.opening_hours WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY staff_id NULLS FIRST, weekday, opens`,
    q`SELECT id, key, label, type, required, options, help_text, position, show_on_web, active FROM ws.field_definitions WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT id, name, type, position FROM ws.stages WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} ORDER BY position, created_at`,
    q`SELECT service_id, staff_id FROM ws.service_staff WHERE account_id = ${ctx.accountId} AND business_id = ${business.id}`,
    q`SELECT id, staff_id, title, starts_at, ends_at FROM ws.appointments
      WHERE account_id = ${ctx.accountId} AND business_id = ${business.id} AND kind = 'block' AND status <> 'cancelled' AND ends_at > now()
      ORDER BY starts_at LIMIT 100`,
  ])
  const enabled = new Map(rows<{ module: WsModule; enabled: boolean }>(modules).map((x) => [x.module, x.enabled]))
  return {
    modules: WS_MODULES.map((module) => ({ module, enabled: ALWAYS_ON_MODULES.includes(module) || enabled.get(module) === true })),
    services: rows<SettingsData['services'][number]>(services),
    staff: rows<SettingsData['staff'][number]>(staff),
    hours: rows<SettingsData['hours'][number]>(hours),
    fields: rows<SettingsData['fields'][number]>(fields).map((x) => ({ ...x, options: Array.isArray(x.options) ? x.options.map(String) : [] })),
    stages: rows<SettingsData['stages'][number]>(stages),
    serviceStaff: rows<SettingsData['serviceStaff'][number]>(serviceStaff),
    timeOff: (timeOff as WsRow[]).map((x) => ({
      id: String(x.id),
      staff_id: (x.staff_id as string | null) ?? null,
      title: (x.title as string | null) ?? null,
      starts_at: new Date(x.starts_at as string).toISOString(),
      ends_at: new Date(x.ends_at as string).toISOString(),
    })),
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

/**
 * Uloží službu a (když přijde `staffIds`) i to, kdo ji dělá — v jedné dávce.
 * Prázdné `staffIds` = dělá ji kdokoli. Pracovník z jiného byznysu se tiše vynechá.
 */
export async function saveService(ctx: WsContext, business: WsBusiness, input: { id?: string; name: string; duration: number; price: number | null; currency: string; showOnWeb: boolean; buffer: number; staffIds?: string[] }): Promise<boolean> {
  const acc = ctx.accountId
  const biz = business.id
  const serviceId = input.id ?? crypto.randomUUID()
  const queries = input.id
    ? [q`UPDATE ws.services SET name = ${input.name}, duration_min = ${input.duration}, price = ${input.price}, currency = ${input.currency}, show_on_web = ${input.showOnWeb}, buffer_min = ${input.buffer} WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${serviceId} RETURNING id`]
    : [q`INSERT INTO ws.services (id, account_id, business_id, name, duration_min, price, currency, show_on_web, position, buffer_min) VALUES (${serviceId}, ${acc}, ${biz}, ${input.name}, ${input.duration}, ${input.price}, ${input.currency}, ${input.showOnWeb}, (SELECT COALESCE(max(position), -1) + 1 FROM ws.services WHERE account_id = ${acc} AND business_id = ${biz}), ${input.buffer}) RETURNING id`]
  if (input.staffIds) {
    queries.push(
      q`DELETE FROM ws.service_staff WHERE account_id = ${acc} AND business_id = ${biz} AND service_id = ${serviceId}`,
      q`INSERT INTO ws.service_staff (account_id, business_id, service_id, staff_id)
        SELECT ${acc}, ${biz}, s.id, st.id
        FROM ws.services s
        JOIN ws.staff st ON st.account_id = s.account_id AND st.business_id = s.business_id AND st.id = ANY(${input.staffIds}::uuid[])
        WHERE s.account_id = ${acc} AND s.business_id = ${biz} AND s.id = ${serviceId}
        ON CONFLICT DO NOTHING`,
    )
  }
  const [saved] = await wsDb(ctx).batch(queries)
  return (saved as WsRow[]).length > 0
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

// --- Otevírací doba, pracovníci, pořadí, dovolené (S13) -----------------------

/**
 * Nahradí celý týden: otevírací dobu firmy (`staffId` null) nebo směny
 * pracovníka. `rows` null u pracovníka = pracuje podle otevírací doby firmy.
 * Prázdný týden firmy = zákazník si čas navrhne sám (R-045).
 */
export async function saveWeekHours(ctx: WsContext, business: WsBusiness, staffId: string | null, rows: HoursRow[] | null): Promise<boolean> {
  const acc = ctx.accountId
  const biz = business.id
  const list = rows ?? []
  const weekdays = list.map((r) => r.weekday)
  const opens = list.map((r) => r.opens)
  const closes = list.map((r) => r.closes)
  if (staffId === null) {
    await wsDb(ctx).batch([
      q`DELETE FROM ws.opening_hours WHERE account_id = ${acc} AND business_id = ${biz} AND staff_id IS NULL`,
      q`INSERT INTO ws.opening_hours (account_id, business_id, staff_id, weekday, opens, closes)
        SELECT ${acc}, ${biz}, NULL, d.weekday, d.opens, d.closes
        FROM unnest(${weekdays}::smallint[], ${opens}::time[], ${closes}::time[]) AS d(weekday, opens, closes)`,
    ])
    return true
  }
  const [staff] = await wsDb(ctx).batch([
    q`SELECT id FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${staffId}`,
    q`DELETE FROM ws.opening_hours WHERE account_id = ${acc} AND business_id = ${biz} AND staff_id = ${staffId}`,
    q`INSERT INTO ws.opening_hours (account_id, business_id, staff_id, weekday, opens, closes)
      SELECT ${acc}, ${biz}, st.id, d.weekday, d.opens, d.closes
      FROM ws.staff st, unnest(${weekdays}::smallint[], ${opens}::time[], ${closes}::time[]) AS d(weekday, opens, closes)
      WHERE st.account_id = ${acc} AND st.business_id = ${biz} AND st.id = ${staffId}`,
  ])
  return (staff as WsRow[]).length > 0
}

export async function saveStaff(ctx: WsContext, business: WsBusiness, input: { id?: string; name: string }): Promise<boolean> {
  const acc = ctx.accountId
  const biz = business.id
  const rows = input.id
    ? await wsDb(ctx)`UPDATE ws.staff SET name = ${input.name} WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${input.id} RETURNING id`
    : await wsDb(ctx)`INSERT INTO ws.staff (account_id, business_id, name, position) VALUES (${acc}, ${biz}, ${input.name}, (SELECT COALESCE(max(position), -1) + 1 FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz})) RETURNING id`
  return rows.length > 0
}

/**
 * Skryje nebo vrátí pracovníka. Poslední aktivní skrýt nejde — termín bez
 * pracovníka by jinak založil nového se jménem firmy (R-044).
 * Vrací 'last', když jde o posledního aktivního.
 */
export async function setStaffActive(ctx: WsContext, business: WsBusiness, id: string, active: boolean): Promise<'ok' | 'last' | 'not_found'> {
  const acc = ctx.accountId
  const biz = business.id
  const rows = await wsDb(ctx)`
    UPDATE ws.staff SET active = ${active}
    WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${id}
      AND (${active} OR EXISTS (SELECT 1 FROM ws.staff o WHERE o.account_id = ${acc} AND o.business_id = ${biz} AND o.active AND o.id <> ${id}))
    RETURNING id`
  if (rows.length) return 'ok'
  const [exists] = await wsDb(ctx)`SELECT 1 FROM ws.staff WHERE account_id = ${acc} AND business_id = ${biz} AND id = ${id}`
  return exists ? 'last' : 'not_found'
}

export type SortableKind = 'services' | 'staff' | 'fields' | 'stages'

/** Nové pořadí po přetažení. Cizí ID se ignorují (filtr účtu a byznysu). */
export async function reorder(ctx: WsContext, business: WsBusiness, kind: SortableKind, ids: string[]): Promise<void> {
  const acc = ctx.accountId
  const biz = business.id
  switch (kind) {
    case 'services':
      await wsDb(ctx)`UPDATE ws.services t SET position = o.n - 1 FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o(id, n) WHERE t.account_id = ${acc} AND t.business_id = ${biz} AND t.id = o.id`
      return
    case 'staff':
      await wsDb(ctx)`UPDATE ws.staff t SET position = o.n - 1 FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o(id, n) WHERE t.account_id = ${acc} AND t.business_id = ${biz} AND t.id = o.id`
      return
    case 'fields':
      await wsDb(ctx)`UPDATE ws.field_definitions t SET position = o.n - 1 FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o(id, n) WHERE t.account_id = ${acc} AND t.business_id = ${biz} AND t.id = o.id`
      return
    case 'stages':
      await wsDb(ctx)`UPDATE ws.stages t SET position = o.n - 1 FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o(id, n) WHERE t.account_id = ${acc} AND t.business_id = ${biz} AND t.id = o.id`
      return
  }
}
