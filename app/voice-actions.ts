'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { adminActorEmail, requireAuth } from '@/lib/auth'
import { VoiceKeyConfigError } from '@/lib/admin/voice/keys'
import {
  MAX_ACTIVE_DEVICES,
  createDevice,
  isMissingVoiceSchema,
  restoreDevice,
  revokeDevice,
  type VoiceDevice,
} from '@/lib/admin/voice/devices'

// ZakazIQ Voice (R-148): zařízení s klíčem v adminu (VO01). Klíč se vrací jen
// z vytvoření a nikam se neloguje; chyby se logují jen názvem.

export type VoiceResult<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string }

const PAGE = '/dashboard/voice'
const idSchema = z.string().uuid()
const nameSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Napište název zařízení, třeba „MacBook".').max(80, 'Název může mít nejvýš 80 znaků.'))

const MISSING = 'Databáze ještě nemá tabulky ZakazIQ Voice (migrace 136).'

function failure(err: unknown, what: string): { ok: false; error: string } {
  if (err instanceof VoiceKeyConfigError) {
    return { ok: false, error: 'Chybí nastavení AGENT_KEY_PEPPER. Doplňte ho do prostředí a zkuste to znovu.' }
  }
  if (isMissingVoiceSchema(err)) return { ok: false, error: MISSING }
  console.error(`[voice] ${what} selhalo:`, err instanceof Error ? err.name : 'unknown')
  return { ok: false, error: 'Něco se nepovedlo. Zkuste to prosím znovu.' }
}

/** Nové zařízení. Klíč je v odpovědi jedinkrát. */
export async function addVoiceDevice(rawName: unknown): Promise<VoiceResult<{ key: string; device: VoiceDevice }>> {
  await requireAuth()
  const name = nameSchema.safeParse(typeof rawName === 'string' ? rawName : '')
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? 'Neplatný název.' }
  try {
    const res = await createDevice(name.data, await adminActorEmail())
    if (!res.ok) {
      return { ok: false, error: `Platných zařízení může být nejvýš ${MAX_ACTIVE_DEVICES}. Nejdřív některé zneplatněte.` }
    }
    revalidatePath(PAGE)
    return { ok: true, key: res.key, device: res.device }
  } catch (err) {
    return failure(err, 'vytvoření zařízení')
  }
}

export async function revokeVoiceDevice(rawId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  if (!id.success) return { ok: false, error: 'Neplatné zařízení.' }
  try {
    const done = await revokeDevice(id.data, await adminActorEmail())
    revalidatePath(PAGE)
    return done ? { ok: true } : { ok: false, error: 'Zařízení už platné není.' }
  } catch (err) {
    return failure(err, 'zneplatnění zařízení')
  }
}

/** „Zpět" po zneplatnění. Po dvou minutách už nejde. */
export async function restoreVoiceDevice(rawId: unknown): Promise<VoiceResult> {
  await requireAuth()
  const id = idSchema.safeParse(rawId)
  if (!id.success) return { ok: false, error: 'Neplatné zařízení.' }
  try {
    const done = await restoreDevice(id.data)
    revalidatePath(PAGE)
    return done ? { ok: true } : { ok: false, error: 'Vrátit už nejde. Přidejte zařízení znovu, dostane nový klíč.' }
  } catch (err) {
    return failure(err, 'vrácení zařízení')
  }
}
