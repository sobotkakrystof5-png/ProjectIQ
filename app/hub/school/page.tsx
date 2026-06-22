import { sql } from '@/lib/db'
import { SUBJECTS, computeSubjectStats, computeGesamtdurchschnitt } from './subjects'
import type { GradeEntry, DeadlineEntry } from './subjects'
import { SchoolClient } from './SchoolClient'

async function getData() {
  const [grades, deadlines] = await Promise.all([
    sql`
      SELECT id, subject,
             grade_type     AS "gradeType",
             grade, note,
             sport_category AS "sportCategory",
             graded_at::text AS "gradedAt"
      FROM school_grades_manual
      WHERE user_id IS NULL
      ORDER BY graded_at DESC, created_at DESC
    ` as unknown as Promise<GradeEntry[]>,

    sql`
      SELECT id, title, subject,
             due_date::text AS "dueDate",
             type, done
      FROM school_deadlines_manual
      WHERE user_id IS NULL
      ORDER BY due_date ASC
    ` as unknown as Promise<DeadlineEntry[]>,
  ])
  return { grades, deadlines }
}

export default async function SchoolPage() {
  const { grades, deadlines } = await getData()
  const subjectStats = SUBJECTS.map(s => computeSubjectStats(s, grades))
  const gesamtdurchschnitt = computeGesamtdurchschnitt(subjectStats)

  return (
    <SchoolClient
      grades={grades}
      deadlines={deadlines}
      subjectStats={subjectStats}
      gesamtdurchschnitt={gesamtdurchschnitt}
    />
  )
}
