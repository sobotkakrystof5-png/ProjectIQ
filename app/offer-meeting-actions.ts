'use server'

import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { hintsForProposal } from '@/lib/admin/offers/meeting-hints'
import type { MeetingHint } from '@/lib/admin/offers/meeting-hints-check'

/**
 * Navrhovač nabídek N4 (R-158): návrhy vstupů nabídky z poslední schůzky
 * s klientem. Jen za přihlášením a na kliknutí; nic se neukládá, editor
 * návrh použije až po dalším kliknutí a koncept se uloží jako vždy.
 */

export type MeetingHintsResult = { ok: true; hints: MeetingHint[] } | { ok: false; error: string }

const ERRORS: Record<string, string> = {
  NOT_FOUND: 'Nabídka nenalezena. Obnovte stránku.',
  NOT_DRAFT: 'Nabídka už odešla, vstupy se nemění.',
  NO_MEETING: 'S klientem zatím není žádná schůzka. Přiřaďte ji ke kontaktu v ZakazIQ Voice.',
  NOT_CONFIGURED: 'Na serveru chybí klíč k modelu. Vstupy vyplňte ručně.',
  EMPTY: 'Přepis schůzky je prázdný.',
  REFUSED: 'Model přepis nezpracoval. Vstupy vyplňte ručně.',
  FAILED: 'Schůzku se nepodařilo projít. Zkuste to za chvíli znovu.',
}

export async function meetingHintsAction(proposalId: string): Promise<MeetingHintsResult> {
  await requireAuth()
  const id = z.string().uuid().safeParse(proposalId)
  if (!id.success) return { ok: false, error: ERRORS.NOT_FOUND }
  try {
    const res = await hintsForProposal(id.data)
    return res.ok ? { ok: true, hints: res.hints } : { ok: false, error: ERRORS[res.code] ?? ERRORS.FAILED }
  } catch (err) {
    console.error('[navrhovac] návrhy ze schůzky:', err instanceof Error ? err.message.slice(0, 120) : 'unknown')
    return { ok: false, error: ERRORS.FAILED }
  }
}
