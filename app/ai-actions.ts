'use server'

import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions, requireAuth } from '@/lib/auth'
import { proposeAction } from '@/lib/ai/propose'
import { suggestionSchema, type Suggestion } from '@/lib/ai/suggestion-schema'
import { CONTEXT_KINDS } from '@/lib/ai/context'
import { TEXT_MAX } from '@/lib/ai/assistant-limits'
import { applyProposal } from '@/lib/admin/suggestion-apply'
import {
  loadSuggestion,
  markApplied,
  markPendingAgain,
  markRejected,
  saveSuggestion,
  suggestionsAvailable,
  type AppliedRef,
} from '@/lib/admin/suggestions'
import { undoProjectStatus } from '@/app/actions'
import { isApiRateLimited, recordApiRequest } from '@/lib/api-rate-limit'
import type { ProjectStatus } from '@/lib/types'

/**
 * Asistent: věta → návrh → **klik člověka** → akce (AD14, R-084).
 *
 * Dvě oddělené cesty schválně. `proposeSuggestion` se jen ptá modelu a návrh
 * uloží jako koncept; `applySuggestion` z prohlížeče dostane **jen `id`**,
 * řádek si načte z databáze a znovu ho prožene schématem. Pozměněný návrh
 * poslaný z prohlížeče tak nemá kudy projít — neposílá se.
 */

const proposeInput = z.object({
  text: z.string().trim().min(1).max(TEXT_MAX),
  contextRef: z
    .object({ kind: z.enum(CONTEXT_KINDS), id: z.string().uuid() })
    .nullish(),
  source: z.enum(['command', 'panel']).default('panel'),
})

export type ProposeOutcome =
  | { ok: true; id: string | null; suggestion: Suggestion }
  | { ok: false; error: string }

/** Pár dotazů za minutu stačí člověku, co píše. Víc znamená skript. */
const RATE_KEY = 'ai-navrh'
const RATE_WINDOW_MINUTES = 1
const RATE_MAX_REQUESTS = 12

export async function proposeSuggestion(raw: unknown): Promise<ProposeOutcome> {
  const session = await getServerSession(authOptions)
  if (!session) return { ok: false, error: 'Přihlaste se prosím znovu.' }

  const parsed = proposeInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Napište, co se má stát (nejvýš 2000 znaků).' }

  const actor = session.user?.email ?? 'admin'
  if (await isApiRateLimited(RATE_KEY, actor, RATE_WINDOW_MINUTES, RATE_MAX_REQUESTS)) {
    return { ok: false, error: 'Moc dotazů za sebou. Zkuste to za chvíli.' }
  }
  await recordApiRequest(RATE_KEY, actor)

  const result = await proposeAction({ text: parsed.data.text, contextRef: parsed.data.contextRef })
  if ('error' in result) return { ok: false, error: result.error }

  // Bez migrace 110 se návrh neuloží (`id` je null) — asistent pak poradí,
  // ale potvrzení jedním klikem se nenabídne. Nic se tím nerozbije.
  const id = await saveSuggestion({
    authorEmail: session.user?.email ?? null,
    source: parsed.data.source,
    // Text už prošel `redactSensitive()` v `proposeAction`; tady se ukládá
    // ten samý, který odešel modelu.
    inputText: parsed.data.text,
    model: result.model,
    suggestion: result.suggestion,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  })

  return { ok: true, id, suggestion: result.suggestion }
}

export type ApplyOutcomePublic =
  | {
      ok: true
      ref: AppliedRef
      message: string
      description?: string
      /** Když je vyplněné, toast nabídne „Zpět" a pošle tuhle hodnotu zpátky. */
      previousStatus?: ProjectStatus
    }
  | { ok: false; error: string }

export async function applySuggestion(id: string): Promise<ApplyOutcomePublic> {
  await requireAuth()
  if (!(await suggestionsAvailable())) {
    return { ok: false, error: 'Potvrzování návrhů zatím není zapnuté (chybí migrace 110).' }
  }

  const row = await loadSuggestion(id)
  // `loadSuggestion` vrací null i tehdy, když uložený `proposal` neprojde
  // schématem — tedy když s ním někdo v databázi hnul. Lepší nic než akce
  // podle tvaru, kterému nerozumíme.
  if (!row) return { ok: false, error: 'Návrh už neplatí. Zkuste to říct znovu.' }
  if (row.status !== 'pending') return { ok: false, error: 'Tenhle návrh už je vyřízený.' }

  // Druhá kontrola téhož, než se provede akce: schéma, ne jen typ.
  const checked = suggestionSchema.safeParse(row.suggestion)
  if (!checked.success) return { ok: false, error: 'Návrh už neplatí. Zkuste to říct znovu.' }

  const outcome = await applyProposal(checked.data.proposal)
  if (!outcome.ok) return outcome

  // Zamkne se až po provedení: dvojklik tak nedostane dvě akce, protože
  // podmínka `status = 'pending'` platí jen pro první průchod.
  const locked = await markApplied(id, outcome.ref)
  if (!locked) return { ok: false, error: 'Tenhle návrh už je vyřízený.' }

  return {
    ok: true,
    ref: outcome.ref,
    message: outcome.message,
    description: outcome.description,
    previousStatus: outcome.previousStatus,
  }
}

export async function rejectSuggestion(id: string): Promise<{ ok: boolean }> {
  await requireAuth()
  return { ok: await markRejected(id) }
}

/**
 * „Zpět" u potvrzeného návrhu. Umí to jediná akce — změna stavu zakázky;
 * ostatní nic nepřepisují, takže se vracet nemusí. Předchozí stav drží
 * prohlížeč z odpovědi `applySuggestion`, v databázi se nikam neukládá.
 */
export async function undoProposedStatus(id: string, previousStatus: ProjectStatus): Promise<{ ok: boolean }> {
  await requireAuth()
  const row = await loadSuggestion(id)
  if (!row || row.status !== 'applied') return { ok: false }
  if (row.suggestion.proposal.kind !== 'update_project_status') return { ok: false }
  if (!row.appliedRef?.id) return { ok: false }

  await undoProjectStatus(row.appliedRef.id, previousStatus)
  await markPendingAgain(id)
  return { ok: true }
}
