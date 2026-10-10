'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertWritable } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace, type WsBusiness, type WsContext } from '@/lib/ws/context'
import { usableAccent } from '@/lib/ws/accent'
import { fail, ok, type Result } from '@/lib/ws/result'
import { moveAndDeleteStage, saveAppearance, saveField, saveService, saveStage, setModule, setServiceActive } from '@/lib/ws/settings'
import { WS_MODULES } from '@/lib/ws/templates/types'

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const id = z.string().uuid()
const fieldType = z.enum(['text', 'choice', 'select', 'number', 'date', 'slot', 'contact', 'address', 'file'])
const stageType = z.enum(['new', 'in_progress', 'done', 'paid', 'cancelled'])
const money = z.number().min(0).max(1_000_000).refine((v) => Math.round(v * 100) === v * 100).nullable()

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

const service = z.object({ id: id.optional(), name: z.string().trim().min(1).max(120), duration: z.number().int().min(5).max(1440), price: money, currency: z.string().regex(/^[A-Z]{3}$/), showOnWeb: z.boolean(), buffer: z.number().int().min(0).max(240) })
export async function saveServiceSettings(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw); if (!p.ok) return p
  const input = service.safeParse(p.input); if (!input.success) return fail('Zkontrolujte název, délku, cenu a rozestup služby.')
  try { await saveService(p.ctx, p.business, input.data); return done(p.business) }
  catch (e) { log('settings.saveService', p.ctx, e); return fail('Službu se nepodařilo uložit. Nejdřív ručně vložte migraci 079.') }
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
