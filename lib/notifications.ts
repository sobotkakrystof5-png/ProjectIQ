import { sql } from '@/lib/db'

export type NotificationType =
  | 'consultation_booked'
  | 'feedback_submitted'
  | 'survey_submitted'
  | 'vizeon_booking'
  | 'project_status_changed'
  | 'reminder_upcoming'

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
