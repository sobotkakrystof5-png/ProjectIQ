import { adminDb } from '@/lib/admin/db'

/**
 * Retence uložených přepisů schůzek (R-144, R-145). Funkce Schůzky z Wispr Flow
 * je z aplikace pryč, tabulka `meeting_notes` (migrace 134) ale zůstala i s daty.
 * Přepis obsahuje osobní údaje klienta, proto ho denní úklid dál maže 3 roky
 * po konání, skrytý po roce. Bez migrace 134 dotaz selže a cron chybu spolkne.
 */
export async function purgeMeetingNotes(): Promise<{ deleted: number }> {
  const [rows] = await adminDb.batch([
    {
      text: `DELETE FROM meeting_notes
              WHERE coalesce(started_at, created_at) < now() - interval '3 years'
                 OR (hidden_at IS NOT NULL AND hidden_at < now() - interval '1 year')
              RETURNING id`,
      params: [],
    },
  ])
  return { deleted: rows.length }
}
