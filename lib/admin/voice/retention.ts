import 'server-only'
import { adminDb } from '@/lib/admin/db'
import { isMissingVoiceSchema } from './devices'

/**
 * ZakazIQ Voice (R-148, VO08): úklid textu diktátů podle nastavené lhůty.
 * Volá ho denní cron `client-retention`. Výchozí `text_retention_days` je
 * NULL = text natrvalo, dokud ho Kryštof nesmaže (D-V7) — pak se neděje nic.
 *
 * Maže se jen text (přepis, vložený, opravený) a s ním dvojice oprav
 * (`voice_corrections`, kusy téhož textu); čísla pro statistiky zůstanou
 * a `text_purged_at` řekne Historii „Text už je smazaný, zůstala čísla".
 * Návrhy a naučená slova vlastní lhůtu nemají: návrh mizí se smazaným
 * diktátem (trigger z migrace 136), slovo ve slovníku zůstává.
 */
export async function purgeVoiceText(now: Date = new Date()): Promise<{ days: number | null; purged: number }> {
  let rows: { value: unknown }[]
  try {
    rows = await adminDb<{ value: unknown }>`SELECT value FROM voice_settings WHERE key = 'text_retention_days'`
  } catch (err) {
    // Bez migrace 136 není co uklízet.
    if (isMissingVoiceSchema(err)) return { days: null, purged: 0 }
    throw err
  }
  const raw = rows[0]?.value
  const days = typeof raw === 'number' && raw >= 1 ? Math.min(3650, Math.round(raw)) : null
  if (days === null) return { days: null, purged: 0 }
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString()
  const done = await adminDb<{ id: string }>`
    WITH purged AS (
      UPDATE voice_dictations
         SET raw_text = NULL, final_text = NULL, edited_text = NULL, text_purged_at = now()
       WHERE created_at < ${cutoff} AND text_purged_at IS NULL
         AND (raw_text IS NOT NULL OR final_text IS NOT NULL OR edited_text IS NOT NULL)
      RETURNING id
    ), pairs AS (
      DELETE FROM voice_corrections c USING purged p WHERE c.dictation_id = p.id
    )
    SELECT id FROM purged
  `
  return { days, purged: done.length }
}
