import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Dotazník spokojenosti na jednu minutu (R-119, migrace 118) proti
 * skutečnému Postgresu (PGlite).
 *
 * Co se hlídá:
 * - migrace projde dvakrát a staré odpovědi zůstanou uzavřené,
 * - známka 0–10 se uloží hned a jde měnit jen do odeslání formuláře,
 * - server sám drží větvení podle známky (reference jen 9–10),
 * - upozornění na nespokojeného klienta odejde jednou,
 * - e-mail nese odkazy s předvybranou známkou a nic z textu nepustí jako HTML.
 */

const ROOT = path.resolve(__dirname, '../..')

import { setAdminDbForTests } from '@/lib/admin/db'
import {
  claimDetractorAlert,
  getGoogleReviewUrl,
  loadSurveyPage,
  markGoogleReviewClick,
  saveGoogleReviewUrl,
  saveSurveyScore,
  setSurveyFollowedUp,
  submitSurveyAnswers,
} from '@/lib/admin/survey-answers'
import {
  areaAverages,
  normalizeSurvey,
  npsBreakdown,
  npsScore,
  ratingAverage,
  unhandledDetractors,
  type SurveyAnswer,
} from '@/lib/admin/survey-model'
import { renderSurveyEmail, scoreUrl } from '@/lib/admin/survey-email'
import { buildReference, referenceAsText } from '@/lib/admin/reference'
import { surveySchema } from '@/lib/feedback-schema'
import { pgliteAdminDriver } from './helpers/admin-pglite'

/** Tvar tabulek před migrací 117 — jen to, na co dotazník sahá. */
const SCHEMA = `
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  company text,
  description text,
  status text NOT NULL DEFAULT 'done',
  project_type text NOT NULL DEFAULT 'client',
  lead_pending boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  survey_token uuid NOT NULL DEFAULT gen_random_uuid()
);
CREATE TABLE project_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  completed_project_id uuid,
  rating_cooperation   integer NOT NULL CHECK (rating_cooperation   BETWEEN 1 AND 5),
  rating_speed         integer NOT NULL CHECK (rating_speed         BETWEEN 1 AND 5),
  rating_design        integer NOT NULL CHECK (rating_design        BETWEEN 1 AND 5),
  rating_functionality integer NOT NULL CHECK (rating_functionality BETWEEN 1 AND 5),
  rating_reliability   integer NOT NULL CHECK (rating_reliability   BETWEEN 1 AND 5),
  rating_flexibility   integer NOT NULL CHECK (rating_flexibility   BETWEEN 1 AND 5),
  reference_text       text,
  consent              boolean NOT NULL DEFAULT false,
  created_at           timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX project_surveys_project_uq ON project_surveys (project_id) WHERE project_id IS NOT NULL;
CREATE TABLE admin_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_settings (id) VALUES (true);
`

const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations', '118_dotaznik_nps.sql'), 'utf8')

let db: PGlite

async function newProject(name = 'Jan Novák'): Promise<{ id: string; token: string }> {
  const row = await db.query<{ id: string; token: string }>(
    `INSERT INTO projects (client_name, client_email, client_phone, company, description, closed_at)
     VALUES ($1, 'jan@example.cz', '+420000000001', 'Kavárna U lipy', 'Web na míru', now())
     RETURNING id::text AS id, survey_token::text AS token`,
    [name],
  )
  return row.rows[0]
}

const base = {
  rating_result: 5,
  rating_communication: 4,
  rating_schedule: null,
  rating_value: null,
  improve_text: undefined,
  reference_text: undefined,
  publish_mode: 'private' as const,
  reviewer_role: undefined,
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  // Stará odpověď z doby před migrací — šest povinných hvězdiček.
  await db.exec(`
    INSERT INTO projects (id, client_name, description, closed_at)
    VALUES ('00000000-0000-4000-8000-000000000001', 'Starý klient', 'Starý web', now());
    INSERT INTO project_surveys (project_id, rating_cooperation, rating_speed, rating_design,
      rating_functionality, rating_reliability, rating_flexibility, consent)
    VALUES ('00000000-0000-4000-8000-000000000001', 5, 4, 5, 5, 4, 5, true);
  `)
  await db.exec(MIGRATION)
  await db.exec(MIGRATION)
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  await db.exec(`
    DELETE FROM project_surveys WHERE project_id <> '00000000-0000-4000-8000-000000000001';
    DELETE FROM projects WHERE id <> '00000000-0000-4000-8000-000000000001';
    UPDATE admin_settings SET google_review_url = NULL;
  `)
})

describe('migrace 118', () => {
  it('stará odpověď je uzavřená a čte se dál', async () => {
    const { rows } = await db.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(s) AS row FROM project_surveys s WHERE project_id = '00000000-0000-4000-8000-000000000001'`,
    )
    const old = normalizeSurvey(rows[0].row)
    expect(old.completed_at).not.toBeNull()
    expect(old.nps).toBeNull()
    expect(old.publish_mode).toBe('named')
    expect(ratingAverage(old)).toBeCloseTo(28 / 6, 5)
  })

  it('odpověď bez jediné známky databáze nepustí', async () => {
    const p = await newProject()
    await expect(db.query(`INSERT INTO project_surveys (project_id) VALUES ($1)`, [p.id])).rejects.toThrow()
    await expect(db.query(`INSERT INTO project_surveys (project_id, nps) VALUES ($1, 11)`, [p.id])).rejects.toThrow()
  })
})

describe('známka z e-mailu', () => {
  it('neznámý odkaz nic neuloží', async () => {
    expect(await saveSurveyScore('11111111-1111-4111-8111-111111111111', 9)).toEqual({ status: 'not_found' })
  })

  it('uloží se hned a jde přepsat, dokud formulář neodešel', async () => {
    const p = await newProject()
    const first = await saveSurveyScore(p.token, 4)
    expect(first.status).toBe('saved')
    const second = await saveSurveyScore(p.token, 8)
    expect(second.status).toBe('saved')

    const { rows } = await db.query<{ count: number; nps: number }>(
      `SELECT count(*)::int AS count, max(nps) AS nps FROM project_surveys WHERE project_id = $1`,
      [p.id],
    )
    expect(rows[0]).toEqual({ count: 1, nps: 8 })

    const page = await loadSurveyPage(p.token)
    expect(page?.answer?.nps).toBe(8)
    expect(page?.answer?.completed_at).toBeNull()
  })

  it('po odeslání formuláře známku změnit nejde', async () => {
    const p = await newProject()
    await submitSurveyAnswers(p.token, { ...base, nps: 10 })
    expect(await saveSurveyScore(p.token, 2)).toEqual({ status: 'completed' })
    expect(await submitSurveyAnswers(p.token, { ...base, nps: 1 })).toEqual({ status: 'completed' })
  })
})

describe('odeslání formuláře', () => {
  it('spokojený: reference a souhlas zůstanou, text „co zlepšit" ne', async () => {
    const p = await newProject()
    const res = await submitSurveyAnswers(p.token, {
      ...base,
      nps: 10,
      reference_text: 'Web byl hotový dřív, než jsme čekali.',
      improve_text: 'nic',
      publish_mode: 'named',
      reviewer_role: 'majitelka kavárny',
    })
    if (res.status !== 'saved') throw new Error(res.status)
    expect(res.answer.reference_text).toBe('Web byl hotový dřív, než jsme čekali.')
    expect(res.answer.improve_text).toBeNull()
    expect(res.answer.consent).toBe(true)
    expect(res.answer.reviewer_role).toBe('majitelka kavárny')
    expect(res.answer.completed_at).not.toBeNull()
    expect(res.answer.rating_result).toBe(5)
    expect(res.answer.rating_schedule).toBeNull()
  })

  it('nespokojený: reference ani souhlas se neuloží, i kdyby je prohlížeč poslal', async () => {
    const p = await newProject()
    const res = await submitSurveyAnswers(p.token, {
      ...base,
      nps: 3,
      reference_text: 'skvělé',
      publish_mode: 'named',
      reviewer_role: 'cokoli',
      improve_text: 'Termín se dvakrát posunul.',
    })
    if (res.status !== 'saved') throw new Error(res.status)
    expect(res.answer.reference_text).toBeNull()
    expect(res.answer.consent).toBe(false)
    expect(res.answer.publish_mode).toBe('private')
    expect(res.answer.reviewer_role).toBeNull()
    expect(res.answer.improve_text).toBe('Termín se dvakrát posunul.')
  })

  it('schéma hlídá rozsah i délky', () => {
    expect(surveySchema.safeParse({ nps: 11 }).success).toBe(false)
    expect(surveySchema.safeParse({ nps: 7, rating_result: 6 }).success).toBe(false)
    expect(surveySchema.safeParse({ nps: 7, improve_text: 'x'.repeat(2001) }).success).toBe(false)
    expect(surveySchema.safeParse({ nps: 7, publish_mode: 'vsem' }).success).toBe(false)
    const ok = surveySchema.safeParse({ nps: 0 })
    expect(ok.success && ok.data.publish_mode).toBe('private')
  })
})

describe('upozornění na nespokojeného klienta', () => {
  it('odejde právě jednou', async () => {
    const p = await newProject()
    const saved = await saveSurveyScore(p.token, 2)
    if (saved.status !== 'saved') throw new Error(saved.status)

    const first = await claimDetractorAlert(saved.surveyId, { onlyUnfinished: true })
    expect(first?.project.client_phone).toBe('+420000000001')
    expect(first?.answer.nps).toBe(2)
    expect(await claimDetractorAlert(saved.surveyId)).toBeNull()
  })

  it('po samotné známce mlčí, když klient mezitím formulář odeslal', async () => {
    const p = await newProject()
    const saved = await saveSurveyScore(p.token, 5)
    if (saved.status !== 'saved') throw new Error(saved.status)
    await submitSurveyAnswers(p.token, { ...base, nps: 5, improve_text: 'Komunikace vázla.' })

    expect(await claimDetractorAlert(saved.surveyId, { onlyUnfinished: true })).toBeNull()
    // Odeslání formuláře upozornění pošle samo, i s textem.
    const alert = await claimDetractorAlert(saved.surveyId)
    expect(alert?.answer.improve_text).toBe('Komunikace vázla.')
  })

  it('spokojený klient upozornění nespustí', async () => {
    const p = await newProject()
    const saved = await saveSurveyScore(p.token, 7)
    if (saved.status !== 'saved') throw new Error(saved.status)
    expect(await claimDetractorAlert(saved.surveyId)).toBeNull()
  })

  it('„Ozval jsem se" ho vyřadí ze seznamu a jde vrátit', async () => {
    const p = await newProject()
    const saved = await saveSurveyScore(p.token, 1)
    if (saved.status !== 'saved') throw new Error(saved.status)

    const read = async () => {
      const { rows } = await db.query<{ row: Record<string, unknown> }>(`SELECT to_jsonb(s) AS row FROM project_surveys s`)
      return rows.map((r) => normalizeSurvey(r.row))
    }
    expect(unhandledDetractors(await read()).map((a) => a.id)).toEqual([saved.surveyId])
    expect(await setSurveyFollowedUp(saved.surveyId, true)).toBe(p.id)
    expect(unhandledDetractors(await read())).toHaveLength(0)
    await setSurveyFollowedUp(saved.surveyId, false)
    expect(unhandledDetractors(await read())).toHaveLength(1)
  })
})

describe('recenze na Googlu', () => {
  it('uloží jen https a prázdnou hodnotou se smaže', async () => {
    expect((await saveGoogleReviewUrl('javascript:alert(1)')).ok).toBe(false)
    expect((await saveGoogleReviewUrl('http://g.page/r/abc/review')).ok).toBe(false)
    expect(await saveGoogleReviewUrl(' https://g.page/r/abc/review ')).toEqual({
      ok: true,
      url: 'https://g.page/r/abc/review',
    })
    expect(await getGoogleReviewUrl()).toBe('https://g.page/r/abc/review')
    expect(await saveGoogleReviewUrl('')).toEqual({ ok: true, url: null })
    expect(await getGoogleReviewUrl()).toBeNull()
  })

  it('kliknutí se zapíše jen u spokojeného klienta', async () => {
    const happy = await newProject('Spokojený')
    const sad = await newProject('Nespokojený')
    await saveSurveyScore(happy.token, 9)
    await saveSurveyScore(sad.token, 6)
    expect(await markGoogleReviewClick(happy.token)).toBe(true)
    expect(await markGoogleReviewClick(sad.token)).toBe(false)
  })
})

describe('počítání', () => {
  const answer = (over: Partial<SurveyAnswer>): SurveyAnswer => ({ ...normalizeSurvey({ id: 'x' }), ...over })

  it('NPS je podíl doporučujících minus podíl nespokojených', () => {
    expect(npsScore([])).toBeNull()
    expect(npsScore([10, 9, 8, 3])).toBe(25)
    expect(npsScore([0, 6])).toBe(-100)
    expect(npsBreakdown([10, 9, 8, 3])).toEqual({ promoter: 2, passive: 1, detractor: 1 })
  })

  it('průměr bere jen vyplněné oblasti', () => {
    expect(ratingAverage(answer({ nps: 9 }))).toBeNull()
    expect(ratingAverage(answer({ nps: 9, rating_result: 5, rating_value: 3 }))).toBe(4)
    const areas = areaAverages([answer({ nps: 9, rating_schedule: 2 }), answer({ nps: 6, rating_schedule: 4 })])
    expect(areas.find((a) => a.key === 'rating_schedule')).toMatchObject({ avg: 3, count: 2 })
    expect(areas.find((a) => a.key === 'rating_result')).toMatchObject({ avg: null, count: 0 })
  })
})

describe('e-mail s dotazníkem', () => {
  const url = 'https://www.zakaziq.cz/h/22222222-2222-4222-8222-222222222222'

  it('má jedenáct odkazů s předvybranou známkou', () => {
    const mail = renderSurveyEmail({ title: 'Web na míru', surveyUrl: url, reminder: false })
    for (let n = 0; n <= 10; n++) expect(mail.html).toContain(`href="${scoreUrl(url, n)}"`)
    expect(scoreUrl(url, 7)).toBe(`${url}?znamka=7`)
    expect(mail.subject).toBe('Jak se vám se mnou pracovalo?')
    expect(mail.text).toContain(`10: ${url}?znamka=10`)
    expect(mail.html).toContain('krystof@vizeon.cz')
  })

  it('připomínka má vlastní předmět a slib, že je poslední', () => {
    const mail = renderSurveyEmail({ title: 'Web', surveyUrl: url, reminder: true })
    expect(mail.subject).toBe('Ještě ta jedna otázka k zakázce')
    expect(mail.text).toContain('víc už vám s tím psát nebudu')
  })

  it('název zakázky se do HTML nevloží jako značky', () => {
    const mail = renderSurveyEmail({ title: '<script>alert(1)</script>', surveyUrl: url, reminder: false })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('odkaz bez https neodejde', () => {
    expect(() => renderSurveyEmail({ title: 'Web', surveyUrl: 'http://example.cz/h/x', reminder: false })).toThrow()
  })
})

describe('reference podle souhlasu', () => {
  const project = { client_name: 'Jan Novák', company: 'Kavárna U lipy' }
  const survey = (over: Record<string, unknown>) =>
    normalizeSurvey({ id: 'a', nps: 10, created_at: '2026-11-17T10:00:00Z', reference_text: 'Super.', ...over })

  it('bez jména nenese jméno ani firmu', () => {
    const snippet = buildReference(survey({ consent: true, publish_mode: 'anonymous' }), project)!
    expect(snippet.name).toBe('Klient')
    expect(snippet.company).toBeNull()
  })

  it('se jménem bere pozici, kterou klient napsal', () => {
    const snippet = buildReference(
      survey({ consent: true, publish_mode: 'named', reviewer_role: 'majitelka kavárny' }),
      project,
    )!
    expect(referenceAsText(snippet)).toContain('Jan Novák, majitelka kavárny')
  })

  it('jen známka bez hvězdiček: reference bez řádku s hvězdičkami', () => {
    const snippet = buildReference(survey({ consent: true, publish_mode: 'named' }), project)!
    expect(snippet.rating).toBeNull()
    expect(referenceAsText(snippet)).not.toContain('★')
  })

  it('„nezveřejňovat" referenci nenabídne', () => {
    expect(buildReference(survey({ consent: false, publish_mode: 'private' }), project)).toBeNull()
  })
})
