import 'server-only'
import { adminDb, batchTolerant, type AdminRow } from '@/lib/admin/db'
import { consentFromMode, normalizeSurvey, type SurveyAnswer } from '@/lib/admin/survey-model'
import type { SurveyInput } from '@/lib/feedback-schema'

/**
 * Odpovědi na dotazník spokojenosti (R-119, migrace 118).
 *
 * Řádek `project_surveys` vzniká už **známkou** (0–10), kterou klient vybere
 * v e-mailu nebo ve formuláři — uloží ji prohlížeč hned, i když zbytek
 * nevyplní. Dokud klient formulář neodešle (`completed_at IS NULL`), smí
 * známku změnit; po odeslání je odpověď uzavřená.
 *
 * Na zakázku je nejvýš jedna odpověď (`project_surveys_project_uq` z migrace
 * 106), takže opakované klikání jen přepisuje tentýž řádek — víc řádků ani
 * upozornění nevznikne. Účet se nikdy nebere z formuláře: zakázku najde
 * tajný `survey_token` z odkazu.
 */

export type SurveyProject = {
  id: string
  title: string
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  company: string | null
}

const PROJECT_COLUMNS = `p.id::text AS id,
  coalesce(nullif(btrim(coalesce(p.description, '')), ''), p.client_name) AS title,
  p.client_name, p.client_email,
  to_jsonb(p) ->> 'client_phone' AS client_phone,
  to_jsonb(p) ->> 'company' AS company`

const PROJECT_BY_TOKEN = `SELECT ${PROJECT_COLUMNS} FROM projects p
  WHERE p.survey_token = $1::uuid AND NOT p.lead_pending LIMIT 1`

/** Dotazník uložený do databáze s ON CONFLICT na jedinou odpověď zakázky. */
const ON_ANSWER = `ON CONFLICT (project_id) WHERE project_id IS NOT NULL`

function asProject(row: AdminRow | undefined): SurveyProject | null {
  return row ? (row as unknown as SurveyProject) : null
}

function asAnswer(row: AdminRow | undefined): SurveyAnswer | null {
  const data = row?.row
  return data && typeof data === 'object' ? normalizeSurvey(data as Record<string, unknown>) : null
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export type SurveyPageState = {
  project: SurveyProject
  answer: SurveyAnswer | null
  googleReviewUrl: string | null
}

/** Všechno, co potřebuje stránka `/h/<token>`, jedním požadavkem. */
export async function loadSurveyPage(token: string): Promise<SurveyPageState | null> {
  const [projectRows, answerRows, settingsRows] = await batchTolerant([
    { text: PROJECT_BY_TOKEN, params: [token] },
    {
      text: `SELECT to_jsonb(s) AS row FROM project_surveys s
             JOIN projects p ON p.id = s.project_id
             WHERE p.survey_token = $1::uuid LIMIT 1`,
      params: [token],
    },
    {
      text: `SELECT to_jsonb(a) ->> 'google_review_url' AS url FROM admin_settings a WHERE a.id = true LIMIT 1`,
      params: [],
    },
  ])
  const project = asProject(projectRows[0])
  if (!project) return null
  return {
    project,
    answer: asAnswer(answerRows[0]),
    googleReviewUrl: httpsUrl(settingsRows[0]?.url),
  }
}

export type SaveScoreResult =
  | { status: 'saved'; surveyId: string; project: SurveyProject }
  | { status: 'completed' }
  | { status: 'not_found' }

/**
 * Známka 0–10 — uloží se hned po kliknutí. Po odeslání celého formuláře už
 * nejde přepsat.
 */
export async function saveSurveyScore(token: string, nps: number): Promise<SaveScoreResult> {
  const [projectRows] = await adminDb.batch([{ text: PROJECT_BY_TOKEN, params: [token] }])
  const project = asProject(projectRows[0])
  if (!project) return { status: 'not_found' }

  const [rows] = await adminDb.batch([
    {
      text: `INSERT INTO project_surveys (project_id, nps, updated_at)
             VALUES ($1::uuid, $2, now())
             ${ON_ANSWER}
             DO UPDATE SET nps = EXCLUDED.nps, updated_at = now()
             WHERE project_surveys.completed_at IS NULL
             RETURNING id::text AS id`,
      params: [project.id, nps],
    },
  ])
  const id = rows[0]?.id
  if (typeof id !== 'string') return { status: 'completed' }
  return { status: 'saved', surveyId: id, project }
}

export type SubmitSurveyResult =
  | { status: 'saved'; answer: SurveyAnswer; project: SurveyProject }
  | { status: 'completed' }
  | { status: 'not_found' }

/**
 * Odeslání celého formuláře. Server si sám ohlídá větvení podle známky:
 * reference a souhlas se zveřejněním patří jen spokojeným (9–10), text
 * „co zlepšit" jen ostatním — kdyby klient známku změnil až po psaní,
 * do databáze nedojde text z druhé větve.
 */
export async function submitSurveyAnswers(token: string, input: SurveyInput): Promise<SubmitSurveyResult> {
  const [projectRows] = await adminDb.batch([{ text: PROJECT_BY_TOKEN, params: [token] }])
  const project = asProject(projectRows[0])
  if (!project) return { status: 'not_found' }

  const promoter = input.nps >= 9
  const publishMode = promoter ? input.publish_mode : 'private'
  const reference = promoter ? input.reference_text || null : null
  const improve = promoter ? null : input.improve_text || null
  const role = promoter && publishMode === 'named' ? input.reviewer_role || null : null

  const [rows] = await adminDb.batch([
    {
      text: `INSERT INTO project_surveys (
               project_id, nps, rating_result, rating_communication, rating_schedule, rating_value,
               improve_text, reference_text, publish_mode, reviewer_role, consent, completed_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
             ${ON_ANSWER}
             DO UPDATE SET
               nps = EXCLUDED.nps,
               rating_result = EXCLUDED.rating_result,
               rating_communication = EXCLUDED.rating_communication,
               rating_schedule = EXCLUDED.rating_schedule,
               rating_value = EXCLUDED.rating_value,
               improve_text = EXCLUDED.improve_text,
               reference_text = EXCLUDED.reference_text,
               publish_mode = EXCLUDED.publish_mode,
               reviewer_role = EXCLUDED.reviewer_role,
               consent = EXCLUDED.consent,
               completed_at = now(),
               updated_at = now()
             WHERE project_surveys.completed_at IS NULL
             RETURNING to_jsonb(project_surveys.*) AS row`,
      params: [
        project.id,
        input.nps,
        input.rating_result ?? null,
        input.rating_communication ?? null,
        input.rating_schedule ?? null,
        input.rating_value ?? null,
        improve,
        reference,
        publishMode,
        role,
        consentFromMode(publishMode),
      ],
    },
  ])
  const answer = asAnswer(rows[0])
  if (!answer) return { status: 'completed' }
  return { status: 'saved', answer, project }
}

export type DetractorAlert = { answer: SurveyAnswer; project: SurveyProject }

/**
 * Zamkne upozornění na nespokojeného klienta (0–6) — odejde **jednou**.
 * `onlyUnfinished`: upozornění po samotné známce se pošle, jen když klient
 * mezitím formulář neodeslal (to pak upozorní odeslání, i s jeho textem).
 */
export async function claimDetractorAlert(
  surveyId: string,
  options: { onlyUnfinished?: boolean } = {},
): Promise<DetractorAlert | null> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE project_surveys s SET detractor_alerted_at = now()
             FROM projects p
             WHERE s.id = $1::uuid AND p.id = s.project_id
               AND s.nps <= 6 AND s.detractor_alerted_at IS NULL
               AND ($2::boolean = false OR s.completed_at IS NULL)
             RETURNING to_jsonb(s.*) AS row, ${PROJECT_COLUMNS}`,
      params: [surveyId, options.onlyUnfinished === true],
    },
  ])
  const row = rows[0]
  const answer = asAnswer(row)
  if (!row || !answer) return null
  return { answer, project: asProject(row)! }
}

/** Klient spokojený (9–10) klikl na recenzi na Googlu. Jen první kliknutí. */
export async function markGoogleReviewClick(token: string): Promise<boolean> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE project_surveys s
             SET google_review_clicked_at = coalesce(s.google_review_clicked_at, now())
             FROM projects p
             WHERE p.id = s.project_id AND p.survey_token = $1::uuid AND s.nps >= 9
             RETURNING s.id::text AS id`,
      params: [token],
    },
  ])
  return rows.length > 0
}

/** „Ozval jsem se" u nespokojeného klienta — a zpět. */
export async function setSurveyFollowedUp(surveyId: string, done: boolean): Promise<string | null> {
  const [rows] = await adminDb.batch([
    {
      text: `UPDATE project_surveys
             SET followed_up_at = CASE WHEN $2::boolean THEN coalesce(followed_up_at, now()) ELSE NULL END
             WHERE id = $1::uuid
             RETURNING project_id::text AS project_id`,
      params: [surveyId, done],
    },
  ])
  const projectId = rows[0]?.project_id
  return typeof projectId === 'string' ? projectId : null
}

export async function getGoogleReviewUrl(): Promise<string | null> {
  const [rows] = await batchTolerant([
    {
      text: `SELECT to_jsonb(a) ->> 'google_review_url' AS url FROM admin_settings a WHERE a.id = true LIMIT 1`,
      params: [],
    },
  ])
  return httpsUrl(rows[0]?.url)
}

/** Prázdná hodnota odkaz smaže. Jinak jen https — jde na veřejnou stránku. */
export async function saveGoogleReviewUrl(raw: string): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const trimmed = raw.trim()
  if (trimmed.length > 500) return { ok: false, error: 'Odkaz je moc dlouhý.' }
  const url = trimmed === '' ? null : httpsUrl(trimmed)
  if (trimmed !== '' && !url) {
    return { ok: false, error: 'Odkaz musí začínat https://. Zkopírujte ho prosím z Googlu celý.' }
  }
  await adminDb.batch([
    {
      text: `INSERT INTO admin_settings (id, google_review_url, updated_at) VALUES (true, $1, now())
             ON CONFLICT (id) DO UPDATE SET google_review_url = EXCLUDED.google_review_url, updated_at = now()`,
      params: [url],
    },
  ])
  return { ok: true, url }
}
