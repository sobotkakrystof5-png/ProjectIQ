export type SubjectConfig = {
  id: string
  label: string
  hasKA: boolean
  isSport?: boolean
}

export const SUBJECTS: SubjectConfig[] = [
  // Hauptfächer — KA + Sonstige
  { id: 'Deutsch', label: 'Deutsch', hasKA: true },
  { id: 'Mathematik', label: 'Mathematik', hasKA: true },
  { id: 'Englisch', label: 'Englisch', hasKA: true },
  { id: 'Tschechisch', label: 'Tschechisch', hasKA: true },
  { id: 'Geschichte', label: 'Geschichte', hasKA: true },
  { id: 'Chemie', label: 'Chemie', hasKA: true },
  { id: 'Physik', label: 'Physik', hasKA: true },
  { id: 'Biologie', label: 'Biologie', hasKA: true },
  // Nebenfächer — jen Sonstige
  { id: 'GRW', label: 'GRW', hasKA: false },
  { id: 'Informatik', label: 'Informatik', hasKA: false },
  { id: 'Musik', label: 'Musik', hasKA: false },
  { id: 'Kunst', label: 'Kunst', hasKA: false },
  { id: 'Ethik', label: 'Ethik', hasKA: false },
  { id: 'Sport', label: 'Sport', hasKA: false, isSport: true },
  { id: 'Geographie', label: 'Geographie', hasKA: false },
]

export type GradeEntry = {
  id: string
  subject: string
  gradeType: 'klassenarbeit' | 'sonstige'
  grade: number
  note: string | null
  sportCategory: string | null
  gradedAt: string
}

export type DeadlineEntry = {
  id: string
  title: string
  subject: string | null
  dueDate: string
  type: 'klassenarbeit' | 'homework' | 'presentation' | 'other'
  done: boolean
}

export type SportCategory = {
  grades: GradeEntry[]
  categoryAvg: number | null
}

export type SubjectStats = {
  subject: SubjectConfig
  kaGrades: GradeEntry[]
  sonstigeGrades: GradeEntry[]
  kaAvg: number | null
  sonstigeAvg: number | null
  finalAvg: number | null
  zeugnisnote: number | null
  sportCategories: Record<string, SportCategory>
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function computeSubjectStats(subject: SubjectConfig, allGrades: GradeEntry[]): SubjectStats {
  const grades = allGrades.filter(g => g.subject === subject.id)
  const kaGrades = grades.filter(g => g.gradeType === 'klassenarbeit')
  const sonstigeGrades = grades.filter(g => g.gradeType === 'sonstige')

  if (subject.isSport) {
    const sportCategories: Record<string, SportCategory> = {}
    for (const g of sonstigeGrades) {
      const cat = g.sportCategory ?? 'Allgemein'
      if (!sportCategories[cat]) sportCategories[cat] = { grades: [], categoryAvg: null }
      sportCategories[cat].grades.push(g)
    }
    for (const cat of Object.keys(sportCategories)) {
      sportCategories[cat].categoryAvg = avg(sportCategories[cat].grades.map(g => g.grade))
    }
    const catAvgs = Object.values(sportCategories)
      .map(c => c.categoryAvg)
      .filter((a): a is number => a !== null)
    const finalAvg = avg(catAvgs)
    return {
      subject, kaGrades: [], sonstigeGrades,
      kaAvg: null, sonstigeAvg: finalAvg, finalAvg,
      zeugnisnote: finalAvg !== null ? Math.round(finalAvg) : null,
      sportCategories,
    }
  }

  const kaAvg = avg(kaGrades.map(g => g.grade))
  const sonstigeAvg = avg(sonstigeGrades.map(g => g.grade))

  let finalAvg: number | null = null
  if (subject.hasKA) {
    if (kaAvg !== null && sonstigeAvg !== null) finalAvg = (kaAvg + sonstigeAvg) / 2
    else finalAvg = kaAvg ?? sonstigeAvg
  } else {
    finalAvg = sonstigeAvg
  }

  return {
    subject, kaGrades, sonstigeGrades,
    kaAvg, sonstigeAvg, finalAvg,
    zeugnisnote: finalAvg !== null ? Math.round(finalAvg) : null,
    sportCategories: {},
  }
}

export function computeGesamtdurchschnitt(stats: SubjectStats[]): number | null {
  const avgs = stats.map(s => s.finalAvg).filter((a): a is number => a !== null)
  return avg(avgs)
}

// Simuluje Gesamtdurchschnitt, pokud by daný předmět měl konkrétní Zeugnisnote
export function simulateGesamtdurchschnitt(
  stats: SubjectStats[],
  subjectId: string,
  simulatedNote: number,
): number | null {
  const updated = stats.map(s =>
    s.subject.id === subjectId
      ? { ...s, finalAvg: simulatedNote, zeugnisnote: simulatedNote }
      : s
  )
  return computeGesamtdurchschnitt(updated)
}
