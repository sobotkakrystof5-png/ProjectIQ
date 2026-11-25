import { sql } from '@/lib/db'

export type NotificationType =
  | 'consultation_booked'
  | 'feedback_submitted'
  | 'survey_submitted'
  /** Poptávka z webu (AD02) — jeden typ pro všechny zdroje. */
  | 'web_lead'
  /**
   * Historické typy před sloučením inboxů (AD02, R-088). Nové oznámení se
   * s nimi už nezakládá, ale staré řádky v databázi je nesou, takže musí
   * zůstat v unii i v TYPE_META v components/NotificationList.tsx.
   */
  | 'vizeon_booking'
  | 'alteno_booking'
  | 'project_status_changed'
  | 'reminder_upcoming'
  | 'agent_lead_received'
  | 'invoice_received'
  | 'client_request_received'
  | 'activity_draft'
  /** Firma od AI asistenta z Growth OS čeká na zavolání (R-112). */
  | 'outreach_lead'
  /** Koncept faktury čeká na schválení (R-117). */
  | 'invoice_draft'
  /** Pozvánka do klientského prostoru neodešla e-mailem (KP11, R-121). */
  | 'portal_invite_failed'
  /** Klient dal v dotazníku 0–6 — ozvat se mu, dokud se dá něco zachránit (R-119). */
  | 'survey_detractor'
  /** Klient v prostoru označil úkol etapy jako hotový (KP12, R-121). */
  | 'client_task_done'
  /** Klient přesunul nebo zrušil konzultaci (KP14, R-126). */
  | 'consultation_changed'
  /** Ke konzultaci se nevytvořil odkaz na Google Meet (KP14, R-126). */
  | 'consultation_meet_failed'
  /** Nová zpráva od klienta v chatu u zakázky (KP15, R-122). */
  | 'client_message'
  /** Připomínka schůzky klientovi neodešla, nebo neběží spouštěč (R-137). */
  | 'meeting_reminder_failed'
  /** Přepis schůzky z Wispr Flow je zpracovaný (R-144). */
  | 'meeting_note'

export async function createNotification(params: {
  type: NotificationType
  title: string
  body?: string
  link?: string
}): Promise<void> {
  try {
    await sql`
      INSERT INTO notifications (type, title, body, link)
      VALUES (${params.type}, ${params.title}, ${params.body ?? null}, ${params.link ?? null})
    `
  } catch (err) {
    console.error('[notifications] Chyba při vytváření oznámení:', err)
  }
}
