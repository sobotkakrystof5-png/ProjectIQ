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
