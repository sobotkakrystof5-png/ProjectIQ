'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions, requireAuth } from '@/lib/auth'
import { confirmMemory, discardMemory, saveMemory } from '@/lib/admin/memory/store'
import { MEMORY_KINDS, MEMORY_SCOPES, MEMORY_TEXT_MAX } from '@/lib/admin/memory/types'

/**
 * Paměť projektu: zapsat, potvrdit, zahodit (AD15).
 *
 * Zapisuje **jen člověk kliknutím**. Druhá cesta do paměti je denní cron
 * (`lib/admin/memory/drafts.ts`), ale ten zakládá výhradně nepotvrzené
 * návrhy — potvrdit je může zase jen klik. Nic se do paměti nedostane samo
 * a potvrzené (R-085).
 */

const MEMORY_ID = z.string().uuid()

const rememberInput = z
  .object({
    scope: z.enum(MEMORY_SCOPES),
    refId: z.string().uuid().nullish(),
    kind: z.enum(MEMORY_KINDS),
    text: z.string().trim().min(1).max(MEMORY_TEXT_MAX),
  })
  // Globální paměť nemá na co ukazovat, ostatní bez odkazu nedávají smysl.
  .refine((v) => (v.scope === 'global' ? !v.refId : Boolean(v.refId)), {
    message: 'Není jasné, čeho se poznámka týká.',
  })

export type MemoryActionResult = { ok: true } | { ok: false; error: string }

/**
 * Kterou obrazovku po zápisu obnovit. `scope` i `refId` sem chodí z prohlížeče
 * jen kvůli tomuhle, takže se do adresy pustí teprve po kontrole tvaru —
 * jinak by do `revalidatePath` šel libovolný řetězec.
 */
function pathFor(scope: string, refId: string | null): string {
  const id = refId !== null && MEMORY_ID.safeParse(refId).success ? refId : null
  if (scope === 'contact' && id) return `/dashboard/kontakty/${id}`
  if (scope === 'project' && id) return `/dashboard/${id}`
  return '/dashboard'
}

export async function rememberFact(raw: unknown): Promise<MemoryActionResult> {
  const session = await getServerSession(authOptions)
  if (!session) return { ok: false, error: 'Přihlaste se prosím znovu.' }

  const parsed = rememberInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: `Napište, co si má systém pamatovat (nejvýš ${MEMORY_TEXT_MAX} znaků).` }
  }

  const result = await saveMemory({
    scope: parsed.data.scope,
    refId: parsed.data.refId ?? null,
    kind: parsed.data.kind,
    text: parsed.data.text,
    source: 'manual',
    // Co napíše člověk, je rovnou potvrzené — návrh ke schválení je jen to,
    // co napsal model.
    confirmedBy: session.user?.email ?? 'admin',
  })
  if (!result.ok) return result

  revalidatePath(pathFor(parsed.data.scope, parsed.data.refId ?? null))
  return { ok: true }
}

export async function confirmMemoryRow(id: string, scope: string, refId: string | null): Promise<MemoryActionResult> {
  const session = await getServerSession(authOptions)
  if (!session) return { ok: false, error: 'Přihlaste se prosím znovu.' }
  if (!MEMORY_ID.safeParse(id).success) return { ok: false, error: 'Tahle poznámka už neplatí.' }

  const done = await confirmMemory(id, session.user?.email ?? 'admin')
  if (!done) return { ok: false, error: 'Tahle poznámka už je vyřízená.' }
  revalidatePath(pathFor(scope, refId))
  return { ok: true }
}

export async function discardMemoryRow(id: string, scope: string, refId: string | null): Promise<MemoryActionResult> {
  await requireAuth()
  if (!MEMORY_ID.safeParse(id).success) return { ok: false, error: 'Tahle poznámka už neplatí.' }
  const done = await discardMemory(id)
  if (!done) return { ok: false, error: 'Tahle poznámka už neexistuje.' }
  revalidatePath(pathFor(scope, refId))
  return { ok: true }
}
