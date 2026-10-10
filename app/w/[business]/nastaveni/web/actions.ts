'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizeOrigin } from '@/lib/security/embed'
import { assertWritable } from '@/lib/ws/billing'
import { hasRole, requireBusiness, requireWorkspace, type WsBusiness, type WsContext } from '@/lib/ws/context'
import { ensureIntegration, isKeyConfigured, rotatePublicKey, rotateSecretKey, setAllowedOrigins } from '@/lib/ws/keys'
import { ingestRequest, loadIntakeConfig, sampleFieldValues } from '@/lib/ws/intake/intake'
import { lastWebSuccess } from '@/lib/ws/intake/log'
import { hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'
import { fail, ok, type Result } from '@/lib/ws/result'

// Nastavení › Napojený web (S11). Jen vlastník (klíče jsou citlivé), bez
// předplatného jen čtení. Tajný klíč se vrací jen jednou z rotateSecret —
// nikam se neloguje ani neukládá v čitelné podobě.

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const FAILED = 'Nepodařilo se uložit. Zkuste to prosím znovu.'
const OWNER_ONLY = 'Napojení webu může měnit jen majitel účtu.'

async function prepare(raw: unknown): Promise<{ ok: true; ctx: WsContext; business: WsBusiness } | { ok: false; error: string }> {
  const ctx = await requireWorkspace()
  const parsed = z.object({ slug }).safeParse(raw)
  if (!parsed.success) return fail('Něco v údajích nesedí. Obnovte prosím stránku.')
  const business = await requireBusiness(ctx, parsed.data.slug)
  if (!hasRole(ctx, 'owner')) return fail(OWNER_ONLY)
  const blocked = await assertWritable(ctx)
  if (blocked) return blocked
  return { ok: true, ctx, business }
}

const logError = (name: string, ctx: WsContext, e: unknown) =>
  console.error(name, { accountId: ctx.accountId, error: e instanceof Error ? e.message : 'unknown' })

/** Nový tajný klíč (i první). Starý přestane platit hned. */
export async function rotateSecret(raw: unknown): Promise<Result<{ key: string }>> {
  const p = await prepare(raw)
  if (!p.ok) return p
  if (!isKeyConfigured()) return fail('Tajné klíče teď nejde vytvořit. Napište nám prosím.')
  try {
    const key = await rotateSecretKey(p.ctx, p.business)
    revalidatePath(`/w/${p.business.slug}/nastaveni/web`)
    return ok({ key })
  } catch (e) {
    logError('integration.rotateSecret', p.ctx, e)
    return fail(FAILED)
  }
}

/** Nový veřejný klíč widgetu. */
export async function rotatePublic(raw: unknown): Promise<Result<null>> {
  const p = await prepare(raw)
  if (!p.ok) return p
  try {
    await rotatePublicKey(p.ctx, p.business)
    revalidatePath(`/w/${p.business.slug}/nastaveni/web`)
    return ok(null)
  } catch (e) {
    logError('integration.rotatePublic', p.ctx, e)
    return fail(FAILED)
  }
}

const originsSchema = z.object({ slug, origins: z.array(z.string().max(200)).max(20) })

/** Povolené domény pro widget a vložení objednávací stránky. */
export async function saveOrigins(raw: unknown): Promise<Result<{ origins: string[] }>> {
  const p = await prepare(raw)
  if (!p.ok) return p
  const parsed = originsSchema.safeParse(raw)
  if (!parsed.success) return fail('Domén může být nejvýš 20.')
  const out: string[] = []
  for (const value of parsed.data.origins.map((v) => v.trim()).filter(Boolean)) {
    // Bez https:// to lidé píšou běžně — doplníme ho.
    const origin = normalizeOrigin(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`)
    if (!origin) return fail(`Adresa „${value.slice(0, 60)}“ nesedí. Napište ji jako https://vasweb.cz, bez cesty.`)
    if (!out.includes(origin)) out.push(origin)
  }
  try {
    await setAllowedOrigins(p.ctx, p.business, out)
    revalidatePath(`/w/${p.business.slug}/nastaveni/web`)
    return ok({ origins: out })
  } catch (e) {
    logError('integration.saveOrigins', p.ctx, e)
    return fail(FAILED)
  }
}

/**
 * „Ověřit napojení“: pošle zkušební poptávku stejnou cestou jako web (kolonky,
 * uložení, záznam) a řekne, kdy naposled přišlo něco z webu.
 */
export async function verifyIntegration(raw: unknown): Promise<Result<{ lastWeb: string | null }>> {
  const ctx = await requireWorkspace()
  const parsed = z.object({ slug }).safeParse(raw)
  if (!parsed.success) return fail('Něco v údajích nesedí. Obnovte prosím stránku.')
  const business = await requireBusiness(ctx, parsed.data.slug)
  if (!hasRole(ctx, 'owner')) return fail(OWNER_ONLY)
  try {
    if (await hitLimit(LIMITS.checkPerBusiness, business.id)) return fail('Zkoušeli jste to teď mnohokrát. Zkuste to prosím za pár minut.')
    const integration = await ensureIntegration(ctx, business)
    const config = await loadIntakeConfig(ctx.accountId, business.id)
    if (!config) return fail(FAILED)
    const result = await ingestRequest(
      { accountId: ctx.accountId, businessId: business.id, integrationId: integration.id, channel: 'check', origin: null },
      {
        name: 'Zkouška napojení',
        email: 'zkouska@example.cz',
        serviceId: config.services[0]?.id ?? null,
        message: 'Zkušební poptávka z tlačítka Ověřit napojení.',
        fields: sampleFieldValues(config.fields),
        test: true,
      },
      { forceTest: true },
    )
    if (!result.body.success) return fail(`Zkušební poptávka neprošla: ${result.body.error}`)
    const last = await lastWebSuccess(ctx, business)
    revalidatePath(`/w/${business.slug}/nastaveni/web`)
    return ok({ lastWeb: last ? last.toISOString() : null })
  } catch (e) {
    logError('integration.verify', ctx, e)
    return fail('Ověření se nepovedlo. Zkuste to prosím znovu.')
  }
}
