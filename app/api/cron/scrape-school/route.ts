import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { scrapeLernSax } from '@/lib/lernsax'
import { scrapeBesteSchule } from '@/lib/besteschule'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function upsertLernSaxData(data: Awaited<ReturnType<typeof scrapeLernSax>>) {
  // Zprávy — vložit jen nové (unikátnost: sender + subject + receivedAt)
  for (const m of data.messages) {
    await sql`
      INSERT INTO school_messages (user_id, sender, subject, body, read, received_at, source)
      VALUES (NULL, ${m.sender}, ${m.subject}, ${m.body}, ${m.read}, ${m.receivedAt.toISOString()}, 'lernsax')
      ON CONFLICT DO NOTHING
    `
  }

  // Termíny — upsert dle title + dueDate + source
  for (const d of data.deadlines) {
    await sql`
      INSERT INTO school_deadlines (user_id, title, subject, due_date, type, source)
      VALUES (NULL, ${d.title}, ${d.subject}, ${d.dueDate.toISOString().slice(0, 10)}, ${d.type}, 'lernsax')
      ON CONFLICT DO NOTHING
    `
  }

  // Rozvrh — upsert dle unique index (user_id, day_of_week, lesson_num, source)
  for (const s of data.timetable) {
    await sql`
      INSERT INTO school_timetable (user_id, day_of_week, lesson_num, subject, teacher, room, time_start, time_end, source, updated_at)
      VALUES (NULL, ${s.dayOfWeek}, ${s.lessonNum}, ${s.subject}, ${s.teacher}, ${s.room}, ${s.timeStart}, ${s.timeEnd}, 'lernsax', now())
      ON CONFLICT (user_id, day_of_week, lesson_num, source)
      DO UPDATE SET subject = EXCLUDED.subject, teacher = EXCLUDED.teacher, room = EXCLUDED.room,
                    time_start = EXCLUDED.time_start, time_end = EXCLUDED.time_end, updated_at = now()
    `
  }
}

async function upsertBesteSchuleData(data: Awaited<ReturnType<typeof scrapeBesteSchule>>) {
  for (const g of data.grades) {
    await sql`
      INSERT INTO school_grades (user_id, subject, grade, grade_label, weight, teacher, date, source)
      VALUES (NULL, ${g.subject}, ${g.grade}, ${g.gradeLabel}, ${g.weight}, ${g.teacher},
              ${g.date ? g.date.toISOString().slice(0, 10) : null}, 'besteschule')
      ON CONFLICT DO NOTHING
    `
  }

  for (const s of data.timetable) {
    await sql`
      INSERT INTO school_timetable (user_id, day_of_week, lesson_num, subject, teacher, room, time_start, time_end, source, updated_at)
      VALUES (NULL, ${s.dayOfWeek}, ${s.lessonNum}, ${s.subject}, ${s.teacher}, ${s.room}, ${s.timeStart}, ${s.timeEnd}, 'besteschule', now())
      ON CONFLICT (user_id, day_of_week, lesson_num, source)
      DO UPDATE SET subject = EXCLUDED.subject, teacher = EXCLUDED.teacher, room = EXCLUDED.room,
                    time_start = EXCLUDED.time_start, time_end = EXCLUDED.time_end, updated_at = now()
    `
  }

  for (const d of data.deadlines) {
    await sql`
      INSERT INTO school_deadlines (user_id, title, subject, due_date, type, source)
      VALUES (NULL, ${d.title}, ${d.subject}, ${d.dueDate.toISOString().slice(0, 10)}, ${d.type}, 'besteschule')
      ON CONFLICT DO NOTHING
    `
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const results = { lernsax: 'skipped', besteschule: 'skipped' }

  // ── LernSax ─────────────────────────────────────────────────────────────
  if (process.env.LERNSAX_USER && process.env.LERNSAX_PASS) {
    try {
      const data = await scrapeLernSax()
      await upsertLernSaxData(data)
      await sql`
        INSERT INTO school_sync_log (user_id, source, status)
        VALUES (NULL, 'lernsax', 'ok')
      `
      results.lernsax = `ok: ${data.messages.length}msg ${data.deadlines.length}tasks ${data.timetable.length}slots`
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sql`
        INSERT INTO school_sync_log (user_id, source, status, error_msg)
        VALUES (NULL, 'lernsax', 'error', ${msg})
      `
      results.lernsax = `error: ${msg}`
    }
  }

  // ── Beste Schule ─────────────────────────────────────────────────────────
  if (process.env.BESTESCHULE_USER && process.env.BESTESCHULE_PASS) {
    try {
      const data = await scrapeBesteSchule()
      await upsertBesteSchuleData(data)
      await sql`
        INSERT INTO school_sync_log (user_id, source, status)
        VALUES (NULL, 'besteschule', 'ok')
      `
      results.besteschule = `ok: ${data.grades.length}grades ${data.timetable.length}slots ${data.deadlines.length}hw`
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await sql`
        INSERT INTO school_sync_log (user_id, source, status, error_msg)
        VALUES (NULL, 'besteschule', 'error', ${msg})
      `
      results.besteschule = `error: ${msg}`
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
