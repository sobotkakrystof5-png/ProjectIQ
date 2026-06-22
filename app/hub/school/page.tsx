import {
  GraduationCap, BarChart2, CalendarCheck, MessageSquare, BookOpen,
  TrendingUp, TrendingDown, Minus, Clock,
  AlertCircle, ChevronRight,
} from 'lucide-react'
import { sql } from '@/lib/db'
import { SyncNowButton } from './SyncNowButton'
import { DeadlineItem } from './DeadlineItem'

// ── DB typy ──────────────────────────────────────────────────────────────────

type GradeRow = {
  subject: string
  avg: string
  count: string
}

type DeadlineRow = {
  id: string
  title: string
  subject: string | null
  due_date: string
  type: 'test' | 'homework' | 'presentation'
  done: boolean
  source: string
}

type MessageRow = {
  id: string
  sender: string
  subject: string
  received_at: string
  read: boolean
  source: string
}

type TimetableRow = {
  day_of_week: number
  lesson_num: number
  subject: string
  teacher: string | null
  room: string | null
  time_start: string | null
  time_end: string | null
}

type SyncRow = {
  source: string
  synced_at: string
  status: string
  error_msg: string | null
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function getSchoolData() {
  const [grades, deadlines, messages, timetable, syncLog] = await Promise.all([
    sql`
      SELECT subject,
             ROUND(AVG(grade)::numeric, 2)::text AS avg,
             COUNT(*)::text AS count
      FROM school_grades
      WHERE user_id IS NULL
      GROUP BY subject
      ORDER BY subject
    ` as unknown as Promise<GradeRow[]>,

    sql`
      SELECT id, title, subject, due_date::text, type, done, source
      FROM school_deadlines
      WHERE user_id IS NULL
      ORDER BY due_date ASC
      LIMIT 50
    ` as unknown as Promise<DeadlineRow[]>,

    sql`
      SELECT id, sender, subject, received_at::text, read, source
      FROM school_messages
      WHERE user_id IS NULL
      ORDER BY received_at DESC
      LIMIT 40
    ` as unknown as Promise<MessageRow[]>,

    sql`
      SELECT day_of_week, lesson_num, subject, teacher, room,
             time_start::text, time_end::text
      FROM school_timetable
      WHERE user_id IS NULL
      ORDER BY day_of_week, lesson_num
    ` as unknown as Promise<TimetableRow[]>,

    sql`
      SELECT DISTINCT ON (source)
             source, synced_at::text, status, error_msg
      FROM school_sync_log
      WHERE user_id IS NULL
      ORDER BY source, synced_at DESC
    ` as unknown as Promise<SyncRow[]>,
  ])

  return { grades, deadlines, messages, timetable, syncLog }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeColor(avg: number) {
  if (avg <= 1.5) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (avg <= 2.5) return 'text-teal-700 bg-teal-50 border-teal-200'
  if (avg <= 3.5) return 'text-amber-700 bg-amber-50 border-amber-200'
  if (avg <= 4.5) return 'text-orange-700 bg-orange-50 border-orange-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function GradeTrend({ avg }: { avg: number }) {
  if (avg <= 2.0) return <TrendingUp size={14} strokeWidth={1.5} className="text-emerald-600" />
  if (avg >= 4.0) return <TrendingDown size={14} strokeWidth={1.5} className="text-red-500" />
  return <Minus size={14} strokeWidth={1.5} className="text-muted-foreground" />
}

const DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek']

function formatRelative(iso: string) {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 60) return `před ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `před ${diffH} h`
  return `před ${Math.round(diffH / 24)} dny`
}

function formatDue(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}d po termínu`, cls: 'text-red-600' }
  if (diff === 0) return { label: 'Dnes', cls: 'text-orange-600 font-semibold' }
  if (diff === 1) return { label: 'Zítra', cls: 'text-amber-600' }
  if (diff <= 7) return { label: `za ${diff} dní`, cls: 'text-foreground' }
  return {
    label: d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' }),
    cls: 'text-muted-foreground',
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SchoolPage() {
  const data = await getSchoolData()

  const noData =
    data.grades.length === 0 &&
    data.deadlines.length === 0 &&
    data.messages.length === 0 &&
    data.timetable.length === 0

  const lastSync = data.syncLog.length > 0
    ? data.syncLog.reduce((a, b) => (a.synced_at > b.synced_at ? a : b))
    : null

  // Rozvrh seskupený po dnech
  const timetableByDay: Record<number, TimetableRow[]> = {}
  for (const slot of data.timetable) {
    if (!timetableByDay[slot.day_of_week]) timetableByDay[slot.day_of_week] = []
    timetableByDay[slot.day_of_week].push(slot)
  }
  const maxLesson = data.timetable.length > 0
    ? Math.max(...data.timetable.map(s => s.lesson_num))
    : 0

  const unreadCount = data.messages.filter(m => !m.read).length
  const overdueCount = data.deadlines.filter(
    d => !d.done && new Date(d.due_date + 'T00:00:00') < new Date()
  ).length

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-purple-700 rounded-xl flex items-center justify-center shadow-sm shrink-0 mt-0.5">
            <GraduationCap size={20} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Škola</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              LernSax & Beste Schule — známky, termíny a rozvrh na jednom místě
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={12} strokeWidth={1.5} />
              Sync {formatRelative(lastSync.synced_at)}
            </span>
          )}
          <SyncNowButton />
        </div>
      </div>

      {/* ── Sync chyby ──────────────────────────────────────────────────────── */}
      {data.syncLog.some(l => l.status === 'error') && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={16} strokeWidth={1.5} className="text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {data.syncLog.filter(l => l.status === 'error').map(l => (
              <p key={l.source} className="text-sm text-red-700">
                <span className="font-semibold capitalize">{l.source}:</span>{' '}
                {l.error_msg ?? 'Neznámá chyba při synchronizaci'}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {noData && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-8 text-center">
          <GraduationCap size={36} strokeWidth={1.5} className="text-violet-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-violet-800 mb-1">Zatím žádná data</p>
          <p className="text-sm text-violet-700 max-w-xs mx-auto mb-4">
            Nastav přihlašovací údaje a klikni na <strong>Sync now</strong> pro první synchronizaci.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['LERNSAX_USER', 'LERNSAX_PASS', 'BESTESCHULE_USER', 'BESTESCHULE_PASS'].map(e => (
              <code key={e} className="text-[11px] bg-violet-100 text-violet-700 border border-violet-200 rounded px-2 py-0.5 font-mono">
                {e}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* ── Přehled známek ──────────────────────────────────────────────────── */}
      {data.grades.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <BarChart2 size={16} strokeWidth={1.5} className="text-violet-600" />
            Přehled známek
          </h2>
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="divide-y divide-border">
              {data.grades.map(g => {
                const avg = parseFloat(g.avg)
                return (
                  <div key={g.subject} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <GradeTrend avg={avg} />
                      <span className="text-sm font-medium text-foreground truncate">{g.subject}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{g.count}×</span>
                    </div>
                    <div className={`text-sm font-bold px-2.5 py-0.5 rounded-lg border ${gradeColor(avg)}`}>
                      {avg.toFixed(1)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Termíny & úkoly ─────────────────────────────────────────────────── */}
      {data.deadlines.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <CalendarCheck size={16} strokeWidth={1.5} className="text-violet-600" />
            Termíny & úkoly
            {overdueCount > 0 && (
              <span className="text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
                {overdueCount} po termínu
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {data.deadlines.map(d => {
              const { label, cls } = formatDue(d.due_date)
              return (
                <DeadlineItem
                  key={d.id}
                  id={d.id}
                  title={d.title}
                  subject={d.subject}
                  type={d.type}
                  done={d.done}
                  dueLabel={label}
                  dueCls={cls}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* ── Komunikace ──────────────────────────────────────────────────────── */}
      {data.messages.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <MessageSquare size={16} strokeWidth={1.5} className="text-violet-600" />
            Komunikace
            {unreadCount > 0 && (
              <span className="text-[11px] font-semibold bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">
                {unreadCount} nepřečteno
              </span>
            )}
          </h2>
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="divide-y divide-border">
              {data.messages.map(m => (
                <div key={m.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${m.read ? 'opacity-0' : 'bg-violet-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-sm truncate ${m.read ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
                        {m.sender}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {formatRelative(m.received_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.subject}</p>
                  </div>
                  <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Rozvrh ──────────────────────────────────────────────────────────── */}
      {data.timetable.length > 0 && maxLesson > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <BookOpen size={16} strokeWidth={1.5} className="text-violet-600" />
            Rozvrh
          </h2>

          {/* Desktop tabulka */}
          <div className="hidden sm:block overflow-x-auto">
            <div className="bg-white border border-border rounded-2xl overflow-hidden min-w-[580px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-10">#</th>
                    {DAYS.map(d => (
                      <th key={d} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from({ length: maxLesson }, (_, i) => i + 1).map(num => (
                    <tr key={num} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">{num}.</td>
                      {[1, 2, 3, 4, 5].map(day => {
                        const slot = (timetableByDay[day] ?? []).find(s => s.lesson_num === num)
                        if (!slot) {
                          return <td key={day} className="px-4 py-3 text-muted-foreground text-xs">—</td>
                        }
                        return (
                          <td key={day} className="px-4 py-3">
                            <p className="font-medium text-foreground text-sm leading-tight">{slot.subject}</p>
                            {slot.teacher && <p className="text-xs text-muted-foreground mt-0.5">{slot.teacher}</p>}
                            {slot.room && <p className="text-xs text-violet-600 mt-0.5">{slot.room}</p>}
                            {slot.time_start && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {slot.time_start}{slot.time_end ? `–${slot.time_end}` : ''}
                              </p>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: po dnech */}
          <div className="sm:hidden space-y-3">
            {[1, 2, 3, 4, 5].map(day => {
              const slots = (timetableByDay[day] ?? []).sort((a, b) => a.lesson_num - b.lesson_num)
              if (slots.length === 0) return null
              return (
                <div key={day} className="bg-white border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {DAYS[day - 1]}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {slots.map(s => (
                      <div key={s.lesson_num} className="flex items-start gap-3 px-4 py-3">
                        <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0 mt-0.5">{s.lesson_num}.</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[
                              s.teacher,
                              s.room,
                              s.time_start && `${s.time_start}${s.time_end ? `–${s.time_end}` : ''}`,
                            ].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
