'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { businessBySlug } from '@/lib/ws/intake/http'
import { ingestRequest, loadIntakeConfig, loadSlots } from '@/lib/ws/intake/intake'
import { clientIp, hitLimit, LIMITS } from '@/lib/ws/intake/rate-limit'
import { orderSlots } from '@/lib/ws/intake/schema'
import { isIsoDate, pragueToUtc } from '@/lib/ws/time'

// Objednávací stránka /r/[slug] (S11): bez přihlášení. Byznys se bere jen
// z veřejného slugu (nikdy účet z formuláře), poptávka jde stejnou cestou
// jako z API (ingestRequest, kanál „page“). Rate limit na IP, past na roboty.

const slug = z.string().min(1).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const uuid = z.string().uuid()

const BUSY = 'Teď je tu moc poptávek najednou. Zkuste to prosím za pár minut.'
const FAILED = 'Poptávku se nepodařilo odeslat. Zkuste to prosím znovu.'

export type OrderSlots = ReturnType<typeof orderSlots>

/** Volné časy pro vybranou službu. */
export async function getOrderSlots(raw: unknown): Promise<{ ok: true; slots: OrderSlots } | { ok: false; error: string }> {
  const parsed = z.object({ slug, serviceId: uuid.nullable() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: FAILED }
  try {
    if (await hitLimit(LIMITS.schemaPerIp, clientIp(await headers()))) return { ok: false, error: BUSY }
    const biz = await businessBySlug(parsed.data.slug)
    if (!biz) return { ok: false, error: FAILED }
    const config = await loadIntakeConfig(biz.accountId, biz.businessId)
    if (!config) return { ok: false, error: FAILED }
    return { ok: true, slots: orderSlots(await loadSlots(biz.accountId, config, parsed.data.serviceId)) }
  } catch (e) {
    console.error('order.slots', { error: e instanceof Error ? e.message : 'unknown' })
    return { ok: false, error: FAILED }
  }
}

const orderSchema = z.object({
  slug,
  serviceId: uuid.nullable(),
  when: z
    .object({ day: z.string().refine(isIsoDate), minutes: z.number().int().min(0).max(1439) })
    .nullable(),
  name: z.string().max(120),
  phone: z.string().max(40),
  email: z.string().max(200),
  message: z.string().max(2000),
  fields: z.record(z.string().max(40), z.string().max(1000)).refine((f) => Object.keys(f).length <= 200),
  website: z.string().max(500),
  marketingConsent: z.boolean().optional(),
})

export type OrderResult =
  | { ok: true }
  | { ok: false; error: string; field?: string; slotTaken?: boolean }

export async function submitOrder(raw: unknown): Promise<OrderResult> {
  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Něco ve formuláři nesedí. Zkontrolujte ho prosím.' }
  const input = parsed.data
  try {
    if (await hitLimit(LIMITS.pagePerIp, clientIp(await headers()))) return { ok: false, error: BUSY }
    const biz = await businessBySlug(input.slug)
    if (!biz) return { ok: false, error: FAILED }
    // Stejný strop na byznys jako API — limit na IP nestačí proti robotům z mnoha adres.
    if (await hitLimit(LIMITS.requestsPerBusiness, biz.businessId)) return { ok: false, error: BUSY }

    const result = await ingestRequest(
      { accountId: biz.accountId, businessId: biz.businessId, integrationId: null, channel: 'page', origin: null },
      {
        name: input.name,
        phone: input.phone,
        email: input.email,
        serviceId: input.serviceId,
        start: input.when ? pragueToUtc(input.when.day, input.when.minutes).toISOString() : null,
        message: input.message,
        fields: input.fields,
        website: input.website,
        marketingConsent: input.marketingConsent,
      },
    )
    if (result.body.success) return { ok: true }
    if (result.body.code === 'SLOT_TAKEN') return { ok: false, error: result.body.error, slotTaken: true }
    const issue = result.body.issues?.[0]
    return {
      ok: false,
      error: result.body.code === 'VALIDATION_ERROR' ? result.body.error : FAILED,
      field: issue?.field,
    }
  } catch (e) {
    console.error('order.submit', { error: e instanceof Error ? e.message : 'unknown' })
    return { ok: false, error: FAILED }
  }
}
