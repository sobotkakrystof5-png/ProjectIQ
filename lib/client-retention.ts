import { sql } from '@/lib/db'

// Retence dat klientů (D-K10, R-076): dokončená zakázka bez pohybu tolik let
// přijde o aktivitu, požadavky, zprávy a slovní hodnocení. Pravidla jsou
// v migraci 098 (public.purge_client_retention), tady jen volání z cronu.

export const CLIENT_RETENTION_YEARS = 3

export type ClientRetentionRun = {
  projects: number
  activity: number
  requests: number
  messages: number
  feedback_texts: number
  invites: number
}

export async function purgeClientRetention(): Promise<ClientRetentionRun> {
  const [row] = await sql`SELECT public.purge_client_retention(${CLIENT_RETENTION_YEARS}) AS r`
  return row.r as ClientRetentionRun
}
