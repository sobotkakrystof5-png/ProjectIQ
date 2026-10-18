'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { fail, ok, type Result } from '@/lib/ws/result'
import { PRIVACY_COOKIE } from '@/lib/ws/privacy'

const privacySchema = z.object({ enabled: z.boolean() })

/** Uloží volbu režimu soukromí pouze pro toto zařízení a pro Workspace. */
export async function setPrivacyModeAction(raw: unknown): Promise<Result<null>> {
  const parsed = privacySchema.safeParse(raw)
  if (!parsed.success) return fail('Nastavení soukromí se nepodařilo uložit.')

  try {
    const jar = await cookies()
    if (parsed.data.enabled) {
      jar.set(PRIVACY_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/w',
        maxAge: 60 * 60 * 24 * 365,
      })
    } else {
      jar.set(PRIVACY_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/w',
        maxAge: 0,
      })
    }
    return ok(null)
  } catch (error) {
    console.error('setPrivacyModeAction', { error: error instanceof Error ? error.message : 'unknown' })
    return fail('Nastavení soukromí se nepodařilo uložit. Zkuste to prosím znovu.')
  }
}
