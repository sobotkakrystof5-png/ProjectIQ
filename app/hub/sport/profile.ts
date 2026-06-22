// Zdravotní profil — 15 let, 162 cm, cíl: nabrat svalovou hmotu
// Upravuj zde pokud se změní výška/věk/cíle

export const PROFILE = {
  age: 15,
  height_cm: 162,
  sex: 'male' as const,
  // Denní cíle (aktivní teenager, mírný kalorický přebytek pro nárůst svalů)
  daily_kcal: 2300,
  protein_g: 100,   // 1.9g/kg × 53 kg
  carbs_g: 290,     // ~50 % kalorií
  fat_g: 65,        // ~25 % kalorií
}

export function calcBMI(weight_kg: number): number {
  const h = PROFILE.height_cm / 100
  return +(weight_kg / (h * h)).toFixed(1)
}

export function bmiCategory(bmi: number): {
  label: string
  detail: string
  level: 'low' | 'ok' | 'high' | 'very_high'
} {
  if (bmi < 17.0) return { label: 'Podváha', detail: 'Jez více kalorií', level: 'low' }
  if (bmi < 24.5) return { label: 'Zdravý', detail: 'Skvělé!', level: 'ok' }
  if (bmi < 28.0) return { label: 'Nadváha', detail: 'Zkus přidat kardio', level: 'high' }
  return { label: 'Obezita', detail: 'Poraď se s lékařem', level: 'very_high' }
}

export function scoreToGrade(score: number): {
  grade: string
  label: string
  bg: string
  text: string
} {
  if (score >= 90) return { grade: 'A', label: 'Výborně!', bg: 'bg-emerald-500', text: 'text-emerald-600' }
  if (score >= 75) return { grade: 'B', label: 'Dobře', bg: 'bg-green-500', text: 'text-green-600' }
  if (score >= 60) return { grade: 'C', label: 'Ujde', bg: 'bg-amber-500', text: 'text-amber-600' }
  if (score >= 40) return { grade: 'D', label: 'Zlepšit', bg: 'bg-orange-500', text: 'text-orange-600' }
  return { grade: 'F', label: 'Špatně', bg: 'bg-red-500', text: 'text-red-600' }
}
