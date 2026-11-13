'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { saveHandover, type HandoverSaveResult } from '@/lib/admin/handover'
import { projectPath } from '@/lib/lead-origins'

/**
 * Uložení předávacího dokumentu (AD16).
 *
 * Validaci i kontrolu citlivých údajů dělá `lib/admin/handover.ts` — tady
 * je jen přihlášení a obnova stránky. Výsledek se vrací jako `Result`,
 * ne výjimkou: „do dokumentu nepatří heslo" je věta pro člověka, ne chyba.
 */
export async function saveProjectHandover(projectId: string, input: unknown): Promise<HandoverSaveResult> {
  await requireAuth()
  const result = await saveHandover(projectId, input)
  if (result.ok) revalidatePath(projectPath(projectId))
  return result
}
