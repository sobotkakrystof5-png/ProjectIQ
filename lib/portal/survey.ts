import 'server-only'
import { portalDb, pq, type PortalRow } from './db'

// Hodnocení v klientském prostoru (KP16, R-119, migrace 125). Úzká funkce
// portal.client_surveys vrátí členovi token dotazníku jeho hotových zakázek;
// odpověď pak jde stejnou cestou jako z e-mailu (app/portal-actions.ts →
// lib/admin/survey-answers.ts) do project_surveys — jedna na zakázku, takže
// Hodnocení v adminu funguje beze změny. Bez migrace se nic nenabídne.

export interface ClientSurvey {
  token: string
  nps: number | null
  completed: boolean
  googleReviewUrl: string | null
}

export const CLIENT_SURVEYS_SQL = (memberId: string) =>
  pq`SELECT project_id::text, survey_token::text, nps, completed, google_review_url FROM portal.client_surveys(${memberId})`

const TOLERATED = new Set(['42P01', '42883', '42501', '42703'])

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

function httpsOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    return new URL(v).protocol === 'https:' ? v : null
  } catch {
    return null
  }
}

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function surveyFromRow(r: PortalRow | undefined): ClientSurvey | null {
  if (!r || typeof r.survey_token !== 'string' || !TOKEN_RE.test(r.survey_token)) return null
  const nps = r.nps == null ? null : Number(r.nps)
  return {
    token: r.survey_token,
    nps: nps != null && Number.isInteger(nps) && nps >= 0 && nps <= 10 ? nps : null,
    completed: r.completed === true,
    googleReviewUrl: httpsOrNull(r.google_review_url),
  }
}

/** Dotazník jedné hotové zakázky, nebo `null` (zakázka není hotová, chybí migrace). */
export async function loadClientSurvey(clientId: string, memberId: string, projectId: string): Promise<ClientSurvey | null> {
  try {
    const [rows] = await portalDb({ clientId }).batch([CLIENT_SURVEYS_SQL(memberId)])
    return surveyFromRow(rows.find((r) => String(r.project_id) === projectId))
  } catch (err) {
    if (TOLERATED.has(pgCode(err) ?? '')) return null
    throw err
  }
}
