'use server'

import { requireAuth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// ── Termíny ──────────────────────────────────────────────────────────────────

export async function addDeadline(data: {
  title: string
  subject: string | null
  dueDate: string
  type: 'klassenarbeit' | 'homework' | 'presentation' | 'other'
}) {
  await requireAuth()
  await sql`
    INSERT INTO school_deadlines_manual (title, subject, due_date, type)
    VALUES (${data.title}, ${data.subject}, ${data.dueDate}, ${data.type})
  `
  revalidatePath('/hub/school')
}

export async function toggleDeadline(id: string, done: boolean) {
  await requireAuth()
  await sql`UPDATE school_deadlines_manual SET done = ${done} WHERE id = ${id}`
  revalidatePath('/hub/school')
}

export async function deleteDeadline(id: string) {
  await requireAuth()
  await sql`DELETE FROM school_deadlines_manual WHERE id = ${id}`
  revalidatePath('/hub/school')
}

// ── Známky ───────────────────────────────────────────────────────────────────

export async function addGrade(data: {
  subject: string
  gradeType: 'klassenarbeit' | 'sonstige'
  grade: number
  note?: string | null
  sportCategory?: string | null
  gradedAt: string
}) {
  await requireAuth()
  await sql`
    INSERT INTO school_grades_manual (subject, grade_type, grade, note, sport_category, graded_at)
    VALUES (
      ${data.subject},
      ${data.gradeType},
      ${data.grade},
      ${data.note ?? null},
      ${data.sportCategory ?? null},
      ${data.gradedAt}
    )
  `
  revalidatePath('/hub/school')
}

export async function deleteGrade(id: string) {
  await requireAuth()
  await sql`DELETE FROM school_grades_manual WHERE id = ${id}`
  revalidatePath('/hub/school')
}
