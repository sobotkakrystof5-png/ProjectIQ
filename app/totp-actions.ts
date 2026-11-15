'use server'

import QRCode from 'qrcode'
import { z } from 'zod'

import { requireAuth } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Dvoufázové ověření adminu (R-105): ověřovací aplikace v telefonu (TOTP).
 * Zapnutí má dva kroky — `startTotpSetup()` vyrobí nepotvrzený faktor s QR
 * kódem, `confirmTotpSetup()` ho potvrdí kódem z aplikace. Dokud se nepotvrdí,
 * přihlášení se nemění.
 *
 * QR kreslí balíček `qrcode`, který v repu už je (R-064) — jen z `otpauth://`
 * adresy od Supabase. Obrázek jde do stránky jako `data:` URL, což CSP
 * povoluje, takže se politika nemění.
 */

export type TotpState = { enabled: boolean }
export type TotpSetup = { factorId: string; qr: string; secret: string }
type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const CODE = z.string().trim().regex(/^\d{6}$/)
const FACTOR_ID = z.string().trim().uuid()
const FRIENDLY_NAME = 'Ověřovací aplikace'

const BROKEN = 'Nepovedlo se to. Zkuste to prosím znovu.'

export async function totpState(): Promise<TotpState> {
  await requireAuth()
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.mfa.listFactors()
  return { enabled: (data?.totp?.length ?? 0) > 0 }
}

export async function startTotpSetup(): Promise<Result<TotpSetup>> {
  await requireAuth()
  const supabase = await createSupabaseServerClient()

  // Nedokončené pokusy z minula uklidit, jinak by se jméno faktoru opakovalo.
  const { data: existing } = await supabase.auth.mfa.listFactors()
  for (const factor of existing?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: FRIENDLY_NAME })
  if (error || !data?.totp?.uri) return { ok: false, error: BROKEN }

  const qr = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 240 })
  return { ok: true, data: { factorId: data.id, qr, secret: data.totp.secret } }
}

export async function confirmTotpSetup(factorId: string, code: string): Promise<Result<null>> {
  await requireAuth()

  const id = FACTOR_ID.safeParse(factorId)
  const parsed = CODE.safeParse(code)
  if (!id.success) return { ok: false, error: BROKEN }
  if (!parsed.success) return { ok: false, error: 'Kód má šest číslic.' }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id.data, code: parsed.data })
  if (error) return { ok: false, error: 'Kód nesouhlasí. Zkuste ten aktuální z aplikace.' }

  return { ok: true, data: null }
}

/**
 * Vypnutí. Supabase ho dovolí jen session, která druhým faktorem prošla,
 * takže cizí člověk s ukradeným heslem ho vypnout nemůže.
 */
export async function disableTotp(): Promise<Result<null>> {
  await requireAuth()

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const factors = (data?.all ?? []).filter((f) => f.factor_type === 'totp')
  if (factors.length === 0) return { ok: true, data: null }

  for (const factor of factors) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return { ok: false, error: 'Vypnout to teď nejde. Přihlaste se znovu a zkuste to.' }
  }
  return { ok: true, data: null }
}
