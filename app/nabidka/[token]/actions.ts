'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { publicToken } from '@/lib/public-token'
import { clientIpFromHeaders } from '@/lib/security/client-ip'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import { VARIANT_KEYS } from '@/lib/admin/offers/pricing'
import { chooseVariant, markOpened } from '@/lib/admin/offers/proposals'

/**
 * Akce stránky nabídky pro klienta (R-155), bez přihlášení. Odkaz s tokenem
 * je jediný přístup, proto: tvar tokenu se ověří dřív, než jde do dotazu,
 * vstupy přes Zod a limit na IP (počítají se i neúspěšné pokusy).
 * Klient smí jen vybrat variantu a zapsat, že nabídku otevřel.
 */

export type ChooseActionResult = { ok: true } | { ok: false; error: 'not_found' | 'expired' | 'locked' | 'limited' | 'failed' }

async function ip(): Promise<string> {
  return clientIpFromHeaders(await headers())
}

export async function chooseOfferVariantAction(token: string, variant: string, management: boolean): Promise<ChooseActionResult> {
  const t = publicToken(token)
  const key = z.enum(VARIANT_KEYS).safeParse(variant)
  if (t === null || !key.success || typeof management !== 'boolean') return { ok: false, error: 'not_found' }

  const from = await ip()
  if (await isApiRateLimited('offer_choose', from, 10, 20)) return { ok: false, error: 'limited' }
  await recordApiRequest('offer_choose', from)

  try {
    return await chooseVariant(t, key.data, management)
  } catch (err) {
    console.error('[nabidka] výběr varianty selhal:', err instanceof Error ? err.name : 'unknown')
    return { ok: false, error: 'failed' }
  }
}

export async function markOfferSeenAction(token: string): Promise<void> {
  const t = publicToken(token)
  if (t === null) return
  const from = await ip()
  if (await isApiRateLimited('offer_seen', from, 10, 60)) return
  await recordApiRequest('offer_seen', from)
  await markOpened(t).catch((err: unknown) => {
    console.error('[nabidka] zápis otevření selhal:', err instanceof Error ? err.name : 'unknown')
  })
}
