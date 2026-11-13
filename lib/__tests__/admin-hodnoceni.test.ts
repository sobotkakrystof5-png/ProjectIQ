import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Dotazník spokojenosti sám od sebe (AD16) proti skutečnému Postgresu (PGlite).
 *
 * Co se hlídá:
 * - dotazník odejde **právě jednou**, i když se akce zopakuje,
 * - „Zpět" (otevření zakázky) ho zastaví,
 * - po sedmi dnech odejde **jedna** připomínka — ověřeno posunutým razítkem
 *   v databázi, ne čekáním,
 * - vyplněný dotazník připomínku ruší,
 * - bez migrace 112 se chová jako dřív: pošle jen uzavření zakázky.
 */

const ROOT = path.resolve(__dirname, '../..')

let db: PGlite
const sent: { to: string; subject: string; heading: string }[] = []

vi.mock('@/lib/email', () => ({
  sendBrandedEmail: async (opts: { to: string; subject: string; heading: string }) => {
    sent.push({ to: opts.to, subject: opts.subject, heading: opts.heading })
  },
}))

import { setAdminDbForTests } from '@/lib/admin/db'
import { remindPendingSurveys, sendSurveyRequest, SURVEY_REMINDER_DAYS } from '@/lib/admin/surveys'
import { buildReference, canUseAsReference, referenceAsJson, referenceAsText } from '@/lib/admin/reference'
import { pgliteAdminDriver } from './helpers/admin-pglite'

/** Jen to, na co dotazník sahá. */
const SCHEMA = `
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_email text,
  description text,
  status text NOT NULL DEFAULT 'new',
  project_type text NOT NULL DEFAULT 'client',
  lead_pending boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  survey_token uuid NOT NULL DEFAULT gen_random_uuid()
);
CREATE TABLE project_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  rating_cooperation integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);
`

/** Z migrace 112 jen ta část, která patří dotazníku. */
function migration112(): string {
  const raw = fs.readFileSync(path.join(ROOT, 'migrations', '112_hodnoceni_a_predani.sql'), 'utf8')
  // `agent_leads` ani `client_leads` v téhle minimální schématu nejsou —
  // příkazy, které se jich týkají, se vynechají celé.
  return raw
    .split(';')
    .filter((statement) => !/agent_leads|ANALYZE/.test(statement))
    .join(';')
}

async function newProject(overrides: Record<string, string | null> = {}): Promise<string> {
  const row = await db.query<{ id: string }>(
    `INSERT INTO projects (client_name, client_email, description, status, project_type, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text AS id`,
    [
      overrides.client_name ?? 'Jan Novák',
      overrides.client_email === undefined ? 'jan@example.cz' : overrides.client_email,
      'Web na míru',
      overrides.status ?? 'done',
      overrides.project_type ?? 'client',
      overrides.closed_at === undefined ? new Date().toISOString() : overrides.closed_at,
    ],
  )
  return row.rows[0].id
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(migration112())
  setAdminDbForTests(pgliteAdminDriver(db))
})

afterAll(async () => {
  setAdminDbForTests(null)
  await db.close()
})

beforeEach(async () => {
  sent.length = 0
  await db.exec('DELETE FROM project_surveys; DELETE FROM projects;')
})

describe('dotazník odchází sám', () => {
  it('uzavřená zakázka dostane dotazník právě jednou', async () => {
    const id = await newProject()

    expect(await sendSurveyRequest(id)).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('jan@example.cz')

    // Druhá akce nad touž zakázkou (uzavření po změně stavu) už nic nepošle.
    expect(await sendSurveyRequest(id)).toBe(false)
    expect(sent).toHaveLength(1)
  })

  it('„Zpět" dotazník zastaví — zakázka už není hotová', async () => {
    const id = await newProject()
    await db.query(`UPDATE projects SET closed_at = NULL, status = 'in_progress' WHERE id = $1`, [id])

    expect(await sendSurveyRequest(id)).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('vlastní projekt a zakázka bez e-mailu zůstanou bez dotazníku', async () => {
    const personal = await newProject({ project_type: 'personal' })
    const bezMailu = await newProject({ client_email: null })

    expect(await sendSurveyRequest(personal)).toBe(false)
    expect(await sendSurveyRequest(bezMailu)).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('zaplacená zakázka bez uzavření dotazník dostane taky', async () => {
    const id = await newProject({ status: 'paid', closed_at: null })
    expect(await sendSurveyRequest(id)).toBe(true)
    expect(sent).toHaveLength(1)
  })
})

describe('jedna připomínka po sedmi dnech', () => {
  /** Posunuté razítko místo čekání: dotazník odešel před osmi dny. */
  async function odeslanoPred(id: string, dnu: number): Promise<void> {
    await db.query(
      `UPDATE projects SET survey_requested_at = now() - make_interval(days => $2) WHERE id = $1`,
      [id, dnu],
    )
  }

  it('odejde právě jedna a podruhé už nic', async () => {
    const id = await newProject()
    await sendSurveyRequest(id)
    sent.length = 0
    await odeslanoPred(id, SURVEY_REMINDER_DAYS + 1)

    expect(await remindPendingSurveys()).toEqual({ sent: 1, failed: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0].heading).toBe('Našli byste pár minut?')

    // Druhý den cron běží znovu — připomínka je už odeslaná.
    expect(await remindPendingSurveys()).toEqual({ sent: 0, failed: 0 })
    expect(sent).toHaveLength(1)
  })

  it('šestý den ještě nic', async () => {
    const id = await newProject()
    await sendSurveyRequest(id)
    sent.length = 0
    await odeslanoPred(id, SURVEY_REMINDER_DAYS - 1)

    expect(await remindPendingSurveys()).toEqual({ sent: 0, failed: 0 })
    expect(sent).toHaveLength(0)
  })

  it('vyplněný dotazník připomínku ruší', async () => {
    const id = await newProject()
    await sendSurveyRequest(id)
    sent.length = 0
    await odeslanoPred(id, SURVEY_REMINDER_DAYS + 1)
    await db.query(`INSERT INTO project_surveys (project_id) VALUES ($1)`, [id])

    expect(await remindPendingSurveys()).toEqual({ sent: 0, failed: 0 })
    expect(sent).toHaveLength(0)
  })

  it('zakázka otevřená zpět připomínku nedostane', async () => {
    const id = await newProject()
    await sendSurveyRequest(id)
    sent.length = 0
    await odeslanoPred(id, SURVEY_REMINDER_DAYS + 1)
    await db.query(`UPDATE projects SET closed_at = NULL, status = 'in_progress' WHERE id = $1`, [id])

    expect(await remindPendingSurveys()).toEqual({ sent: 0, failed: 0 })
    expect(sent).toHaveLength(0)
  })

  it('rok stará zakázka se po výpadku cronu nepřipomíná', async () => {
    const id = await newProject()
    await sendSurveyRequest(id)
    sent.length = 0
    await odeslanoPred(id, 400)

    expect(await remindPendingSurveys()).toEqual({ sent: 0, failed: 0 })
    expect(sent).toHaveLength(0)
  })
})

describe('bez migrace 112', () => {
  let stara: PGlite

  beforeAll(async () => {
    stara = new PGlite()
    await stara.exec(SCHEMA)
  })

  afterAll(async () => {
    await stara.close()
    setAdminDbForTests(pgliteAdminDriver(db))
  })

  it('uzavření pošle dotazník, změna stavu mlčí a připomínka se nedělá', async () => {
    setAdminDbForTests(pgliteAdminDriver(stara))
    sent.length = 0
    const row = await stara.query<{ id: string }>(
      `INSERT INTO projects (client_name, client_email, status, closed_at)
       VALUES ('Jan Novák', 'jan@example.cz', 'done', now()) RETURNING id::text AS id`,
    )
    const id = row.rows[0].id

    // Změna stavu bez zámku v databázi radši nepošle nic.
    expect(await sendSurveyRequest(id)).toBe(false)
    expect(sent).toHaveLength(0)

    // Uzavření zakázky posílalo dotazník i před AD16 — posílá dál.
    expect(await sendSurveyRequest(id, { fallbackWithoutColumn: true })).toBe(true)
    expect(sent).toHaveLength(1)

    expect(await remindPendingSurveys()).toEqual({ sent: 0, failed: 0 })
  })
})

describe('reference pro web', () => {
  const survey = {
    id: 'a', project_id: 'b', completed_project_id: null,
    rating_cooperation: 5, rating_speed: 5, rating_design: 4,
    rating_functionality: 5, rating_reliability: 5, rating_flexibility: 4,
    reference_text: '  Web byl hotov\u00fd d\u0159\u00edv, ne\u017e jsme \u010dekali.  ',
    consent: true,
    created_at: '2026-11-13T08:30:00.000Z',
  }
  const project = { client_name: 'Jan Nov\u00e1k', company: 'Kav\u00e1rna U lipy' }

  it('bez souhlasu se nenab\u00eddne', () => {
    expect(canUseAsReference({ consent: false })).toBe(false)
    expect(buildReference({ ...survey, consent: false }, project)).toBeNull()
  })

  it('nese jm\u00e9no, firmu, hv\u011bzdi\u010dky i text klienta', () => {
    const snippet = buildReference(survey, project)!
    expect(snippet.name).toBe('Jan Nov\u00e1k')
    expect(snippet.company).toBe('Kav\u00e1rna U lipy')
    expect(snippet.rating).toBe(4.7)
    expect(snippet.stars).toBe(5)
    expect(snippet.text).toBe('Web byl hotov\u00fd d\u0159\u00edv, ne\u017e jsme \u010dekali.')
    expect(snippet.date).toBe('2026-11-13')
  })

  it('text klienta se nep\u0159episuje a hv\u011bzdi\u010dky jdou s n\u00edm', () => {
    const text = referenceAsText(buildReference(survey, project)!)
    expect(text).toContain('Web byl hotov\u00fd d\u0159\u00edv, ne\u017e jsme \u010dekali.')
    expect(text).toContain('Jan Nov\u00e1k, Kav\u00e1rna U lipy')
    expect(text).toContain('\u2605\u2605\u2605\u2605\u2605 4.7 / 5')
  })

  it('hodnocen\u00ed bez textu je po\u0159\u00e1d reference, jen bez cit\u00e1tu', () => {
    const snippet = buildReference({ ...survey, reference_text: '   ' }, { client_name: 'Jan', company: null })!
    expect(snippet.text).toBeNull()
    expect(snippet.company).toBeNull()
    expect(referenceAsText(snippet).startsWith('\u2014 Jan')).toBe(true)
    expect(JSON.parse(referenceAsJson(snippet)).text).toBeNull()
  })
})
