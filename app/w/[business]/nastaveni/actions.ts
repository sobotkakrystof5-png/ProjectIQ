'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace, type WsBusiness, type WsContext } from '@/lib/ws/context'
import { usableAccent } from '@/lib/ws/accent'
import { fail, ok, type Result } from '@/lib/ws/result'
import { createBlock } from '@/lib/ws/bookings'
import { MAX_RANGES_PER_DAY, weekToRows } from '@/lib/ws/hours'
import { moveAndDeleteStage, reorder, restoreModules, saveAppearance, saveField, savePortalRules, saveService, saveStaff, saveStage, saveWeekHours, setModule, setServiceActive, setStaffActive } from '@/lib/ws/settings'
import { hasWholeMinor } from '@/lib/ws/money'
import { addDays, isIsoDate, pragueToUtc } from '@/lib/ws/time'
import { ADDRESS_MAX, CHANGE_HOURS_OPTIONS } from '@/lib/ws/portal-rules'
import { WS_MODULES } from '@/lib/ws/templates/types'

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const id = z.string().uuid()
const fieldType = z.enum(['text', 'choice', 'select', 'number', 'date', 'slot', 'contact', 'address', 'file'])
const stageType = z.enum(['new', 'in_progress', 'done', 'paid', 'cancelled'])
const money = z.number().min(0).max(1_000_000).refine(hasWholeMinor).nullable()

type Prepared = { ok: true; ctx: WsContext; business: WsBusiness; input: Record<string, unknown> }
type PreparationFailure = { ok: false; error: string }
async function prepare(raw: unknown): Promise<Prepared | PreparationFailure> {
  const parsed = z.object({ slug }).passthrough().safeParse(raw)
  if (!parsed.success) return fail('Něco v údajích nesedí. Obnovte prosím stránku.')
  const ctx = await requireWorkspace()
  const business = await requireBusiness(ctx, parsed.data.slug)
  if (!hasRole(ctx, 'owner')) return fail('Nastavení firmy mění majitel účtu.')
  const blocked = await assertWritable(ctx)
  if (blocked) return blocked
  return { ok: true, ctx, business, input: parsed.data }
}

function done(business: WsBusiness): Result<null> {
  revalidatePath(`/w/${business.slug}`, 'layout')
  return ok(null)
}
function log(name: string, ctx: WsContext, error: unknown): void {
  console.error(name, { accountId: ctx.accountId, error: error instanceof Error ? error.message : 'unknown' })
}

export async function changeModule(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ module: z.enum(WS_MODULES), enabled: z.boolean() }).safeParse(p.input)
  if (!input.success) return fail('Vybraná funkce nesedí.')
  try { await setModule(p.ctx, p.business, input.data.module, input.data.enabled); return done(p.business) }
  catch (e) { log('settings.changeModule', p.ctx, e); return fail('Funkci se nepodařilo uložit. Zkuste to prosím znovu.') }
}

export async function restoreModuleSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ modules: z.array(z.object({ module: z.enum(WS_MODULES), enabled: z.boolean() })).length(WS_MODULES.length) }).safeParse(p.input)
  if (!input.success || new Set(input.data.modules.map((item) => item.module)).size !== WS_MODULES.length) return fail('Předchozí nastavení se nepodařilo obnovit. Obnovte prosím stránku.')
  try { await restoreModules(p.ctx, p.business, input.data.modules); return done(p.business) }
  catch (e) { log('settings.restoreModules', p.ctx, e); return fail('Předchozí nastavení se nepodařilo obnovit. Zkuste to prosím znovu.') }
}

const service = z.object({ id: id.optional(), name: z.string().trim().min(1).max(120), duration: z.number().int().min(5).max(1440), price: money, currency: z.string().regex(/^[A-Z]{3}$/), showOnWeb: z.boolean(), buffer: z.number().int().min(0).max(240), staffIds: z.array(id).max(100).optional() })
export async function saveServiceSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = service.safeParse(p.input); if (!input.success) return fail('Zkontrolujte název, délku, cenu a rozestup služby.')
  try { if (!(await saveService(p.ctx, p.business, input.data))) return fail('Služba už tu není. Obnovte prosím stránku.'); return done(p.business) }
  catch (e) { log('settings.saveService', p.ctx, e); return fail('Službu se nepodařilo uložit. Zkuste to prosím znovu.') }
}
export async function hideService(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ id, active: z.boolean() }).safeParse(p.input); if (!input.success) return fail('Služba nesedí.')
  try { await setServiceActive(p.ctx, p.business, input.data.id, input.data.active); return done(p.business) }
  catch (e) { log('settings.hideService', p.ctx, e); return fail('Službu se nepodařilo uložit.') }
}

const field = z.object({ id: id.optional(), key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.string().trim().min(1).max(120), type: fieldType, required: z.boolean(), options: z.array(z.string().trim().min(1).max(80)).max(30), help: z.string().trim().max(300).nullable(), showOnWeb: z.boolean() })
export async function saveFieldSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = field.safeParse(p.input); if (!input.success) return fail('Kolonka nesedí. Zkontrolujte její název a možnosti.')
  if ((input.data.type === 'choice' || input.data.type === 'select') && input.data.options.length < 2) return fail('Volba potřebuje alespoň dvě možnosti.')
  if (!['text', 'choice', 'select', 'number', 'date', 'address'].includes(input.data.type) && input.data.showOnWeb) return fail('Tento typ pole se do formuláře přidává automaticky, na web ho nezapínejte.')
  try { await saveField(p.ctx, p.business, input.data); return done(p.business) }
  catch (e) { log('settings.saveField', p.ctx, e); return fail('Kolonku se nepodařilo uložit. Klíč už možná používáte.') }
}

const stage = z.object({ id: id.optional(), name: z.string().trim().min(1).max(80), type: stageType })
export async function saveStageSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = stage.safeParse(p.input); if (!input.success) return fail('Název nebo typ stavu nesedí.')
  try { await saveStage(p.ctx, p.business, input.data); return done(p.business) }
  catch (e) { log('settings.saveStage', p.ctx, e); return fail('Stav se nepodařilo uložit.') }
}
export async function deleteStageSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ id, targetId: id }).refine((x) => x.id !== x.targetId).safeParse(p.input); if (!input.success) return fail('Vyberte jiný stav, kam se zakázky přesunou.')
  try { await moveAndDeleteStage(p.ctx, p.business, input.data.id, input.data.targetId); return done(p.business) }
  catch (e) { log('settings.deleteStage', p.ctx, e); return fail('Stav se nepodařilo odstranit.') }
}

export async function saveAppearanceSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable() }).safeParse(p.input)
  if (!input.success || (input.data.color && !usableAccent(input.data.color))) return fail('Vyberte tmavší barvu, aby na ní byl čitelný bílý text.')
  try { await saveAppearance(p.ctx, p.business, input.data.color); return done(p.business) }
  catch (e) { log('settings.saveAppearance', p.ctx, e); return fail('Vzhled se nepodařilo uložit.') }
}

const portalInput = z.object({
  changeHours: z.union([z.literal(CHANGE_HOURS_OPTIONS[0]), ...CHANGE_HOURS_OPTIONS.slice(1).map((h) => z.literal(h)), z.null()]),
  address: z.string().trim().max(ADDRESS_MAX),
})
export async function savePortalSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = portalInput.safeParse(p.input); if (!input.success) return fail(`Zkontrolujte adresu (nejvýš ${ADDRESS_MAX} znaků).`)
  try { await savePortalRules(p.ctx, p.business, { changeHours: input.data.changeHours, address: input.data.address || null }); return done(p.business) }
  catch (e) { log('settings.savePortal', p.ctx, e); return fail('Nastavení odkazu se nepodařilo uložit. Zkuste to prosím znovu.') }
}

// --- Otevírací doba, pracovníci, pořadí, dovolené -----------------------------

const range = z.object({ opens: z.string().max(8), closes: z.string().max(8) })
const week = z.array(z.array(range).max(MAX_RANGES_PER_DAY)).length(7)

/** Otevírací doba firmy (`staffId` null) nebo směny pracovníka (`week` null = jako firma). */
export async function saveHoursSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ staffId: id.nullable(), week: week.nullable() }).safeParse(p.input)
  if (!input.success || (input.data.staffId === null && input.data.week === null)) return fail('Časy nesedí. Obnovte prosím stránku a zkuste to znovu.')
  let rows = null
  if (input.data.week) {
    const checked = weekToRows(input.data.week)
    if (!checked.ok) return fail(checked.error)
    if (input.data.staffId && !checked.rows.length) return fail('Vyberte aspoň jeden pracovní den, nebo nechte otevírací dobu firmy.')
    rows = checked.rows
  }
  try {
    if (!(await saveWeekHours(p.ctx, p.business, input.data.staffId, rows))) return fail('Pracovník už tu není. Obnovte prosím stránku.')
    return done(p.business)
  } catch (e) { log('settings.saveHours', p.ctx, e); return fail('Časy se nepodařilo uložit. Zkuste to prosím znovu.') }
}

export async function saveStaffSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ id: id.optional(), name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() }).safeParse(p.input)
  if (!input.success) return fail('Napište jméno pracovníka (nejvýš 80 znaků).')
  try { if (!(await saveStaff(p.ctx, p.business, input.data))) return fail('Pracovník už tu není. Obnovte prosím stránku.'); return done(p.business) }
  catch (e) { log('settings.saveStaff', p.ctx, e); return fail('Pracovníka se nepodařilo uložit. Zkuste to prosím znovu.') }
}

export async function changeStaffActive(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ id, active: z.boolean() }).safeParse(p.input); if (!input.success) return fail('Pracovník nesedí.')
  try {
    const res = await setStaffActive(p.ctx, p.business, input.data.id, input.data.active)
    if (res === 'last') return fail('Aspoň jeden pracovník musí zůstat. Nejdřív přidejte jiného.')
    if (res === 'not_found') return fail('Pracovník už tu není. Obnovte prosím stránku.')
    return done(p.business)
  } catch (e) { log('settings.staffActive', p.ctx, e); return fail('Pracovníka se nepodařilo uložit.') }
}

export async function reorderSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ kind: z.enum(['services', 'staff', 'fields', 'stages']), ids: z.array(id).min(1).max(200) }).safeParse(p.input)
  if (!input.success || new Set(input.data.ids).size !== input.data.ids.length) return fail('Pořadí nesedí. Obnovte prosím stránku.')
  try { await reorder(p.ctx, p.business, input.data.kind, input.data.ids); return done(p.business) }
  catch (e) { log('settings.reorder', p.ctx, e); return fail('Pořadí se nepodařilo uložit. Zkuste to prosím znovu.') }
}

const isoDay = z.string().refine(isIsoDate)
/** Dovolená pracovníka nebo zavřeno pro celou firmu: celé dny od–do včetně. */
export async function addTimeOff(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = z.object({ staffId: id.nullable(), from: isoDay, to: isoDay, title: z.string().trim().min(1).max(80) }).safeParse(p.input)
  if (!input.success || input.data.to < input.data.from) return fail('Zkontrolujte prosím, od kdy do kdy volno platí, a napište důvod.')
  if (input.data.to > addDays(input.data.from, 365)) return fail('Volno může trvat nejdéle rok.')
  const start = pragueToUtc(input.data.from, 0)
  const end = pragueToUtc(addDays(input.data.to, 1), 0)
  try {
    const res = await createBlock(p.ctx, p.business, { staffId: input.data.staffId, start, end, title: input.data.title })
    if (!res.ok) return fail(res.reason === 'overlap'
      ? 'V těch dnech už má termíny. Přesuňte je v kalendáři, nebo zvolte jiné dny.'
      : 'Pracovník už tu není. Obnovte prosím stránku.')
    return done(p.business)
  } catch (e) { log('settings.addTimeOff', p.ctx, e); return fail('Volno se nepodařilo uložit. Zkuste to prosím znovu.') }
}
