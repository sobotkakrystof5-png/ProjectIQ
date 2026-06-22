'use server'

import { sql } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Unauthorized')
}

// ─── Nutrition ────────────────────────────────────────────────────────────────

export interface NutritionLog {
  id: string
  logged_date: string
  food_name: string
  food_id: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  amount_g: number
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  created_at: string
}

export async function getNutritionDay(date: string): Promise<NutritionLog[]> {
  await requireAuth()
  const rows = await sql`
    SELECT
      id::text, logged_date::text, food_name, food_id,
      calories::float, protein_g::float, carbs_g::float, fat_g::float, fiber_g::float,
      amount_g::float, meal_type, created_at::text
    FROM nutrition_logs
    WHERE user_id IS NULL AND logged_date = ${date}
    ORDER BY created_at ASC
  `
  return rows as NutritionLog[]
}

export async function logFood(data: {
  logged_date: string
  food_name: string
  food_id?: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  amount_g: number
  meal_type: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.food_name?.trim()) return { error: 'Název potraviny je povinný' }
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(data.meal_type))
      return { error: 'Neplatný typ jídla' }

    await sql`
      INSERT INTO nutrition_logs
        (user_id, logged_date, food_name, food_id,
         calories, protein_g, carbs_g, fat_g, fiber_g, amount_g, meal_type)
      VALUES
        (NULL, ${data.logged_date}, ${data.food_name.trim()}, ${data.food_id ?? null},
         ${data.calories}, ${data.protein_g}, ${data.carbs_g}, ${data.fat_g}, ${data.fiber_g},
         ${data.amount_g}, ${data.meal_type})
    `
    await recalcHealthScore(data.logged_date)
    revalidatePath('/hub/sport')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit jídlo' }
  }
}

export async function deleteFood(id: string): Promise<void> {
  await requireAuth()
  const rows = await sql`
    DELETE FROM nutrition_logs
    WHERE id = ${id} AND user_id IS NULL
    RETURNING logged_date::text AS logged_date
  `
  const date = (rows as any[])[0]?.logged_date
  if (date) await recalcHealthScore(date)
  revalidatePath('/hub/sport')
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export interface WorkoutLog {
  id: string
  logged_date: string
  title: string
  muscle_groups: string[]
  duration_min: number | null
  notes: string | null
  created_at: string
}

export async function getWorkoutsMonth(year: number, month: number): Promise<WorkoutLog[]> {
  await requireAuth()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = new Date(year, month, 0).toISOString().slice(0, 10)
  const rows = await sql`
    SELECT id::text, logged_date::text, title, muscle_groups, duration_min, notes, created_at::text
    FROM workout_logs
    WHERE user_id IS NULL AND logged_date BETWEEN ${from} AND ${to}
    ORDER BY logged_date ASC, created_at ASC
  `
  return rows as WorkoutLog[]
}

export async function getWorkoutsRecent(): Promise<WorkoutLog[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, logged_date::text, title, muscle_groups, duration_min, notes, created_at::text
    FROM workout_logs
    WHERE user_id IS NULL
    ORDER BY logged_date DESC, created_at DESC
    LIMIT 30
  `
  return rows as WorkoutLog[]
}

export async function logWorkout(data: {
  logged_date: string
  title: string
  muscle_groups: string[]
  duration_min?: number | null
  notes?: string
}): Promise<{ error?: string }> {
  try {
    await requireAuth()
    if (!data.title?.trim()) return { error: 'Název tréninku je povinný' }
    if (!data.logged_date) return { error: 'Datum je povinné' }

    await sql`
      INSERT INTO workout_logs
        (user_id, logged_date, title, muscle_groups, duration_min, notes)
      VALUES
        (NULL, ${data.logged_date}, ${data.title.trim()}, ${data.muscle_groups},
         ${data.duration_min ?? null}, ${data.notes?.trim() ?? null})
    `
    await recalcHealthScore(data.logged_date)
    revalidatePath('/hub/sport')
    return {}
  } catch {
    return { error: 'Nepodařilo se uložit trénink' }
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  await requireAuth()
  const rows = await sql`
    DELETE FROM workout_logs
    WHERE id = ${id} AND user_id IS NULL
    RETURNING logged_date::text AS logged_date
  `
  const date = (rows as any[])[0]?.logged_date
  if (date) await recalcHealthScore(date)
  revalidatePath('/hub/sport')
}

// ─── Health Score ─────────────────────────────────────────────────────────────

// Daily targets (single-admin, fixed)
const PROTEIN_TARGET_G = 120   // ~1.6g/kg × 75kg
const CARBS_TARGET_G = 270     // 45% of 2400 kcal / 4
const FAT_TARGET_G = 75        // 28% of 2400 kcal / 9

function scoreMacro(actual: number, target: number): number {
  if (target === 0) return 0
  const ratio = actual / target
  if (ratio >= 0.9 && ratio <= 1.2) return 100
  if (ratio < 0.9) return Math.max(0, Math.round((ratio / 0.9) * 100))
  return Math.max(0, Math.round(((2.0 - ratio) / 0.8) * 100))
}

function calculateHealthScore(
  totalProtein: number,
  totalCarbs: number,
  totalFat: number,
  workoutDone: boolean
): { score: number; proteinScore: number; carbsScore: number; fatScore: number; activityScore: number } {
  const proteinScore = scoreMacro(totalProtein, PROTEIN_TARGET_G)
  const carbsScore = scoreMacro(totalCarbs, CARBS_TARGET_G)
  const fatScore = scoreMacro(totalFat, FAT_TARGET_G)
  const activityScore = workoutDone ? 100 : 0

  const score = Math.round(
    proteinScore * 0.35 +
    carbsScore * 0.25 +
    fatScore * 0.25 +
    activityScore * 0.15
  )
  return { score, proteinScore, carbsScore, fatScore, activityScore }
}

export async function recalcHealthScore(date: string): Promise<void> {
  try {
    const nutRows = await sql`
      SELECT
        COALESCE(SUM(protein_g), 0)::float AS total_protein,
        COALESCE(SUM(carbs_g), 0)::float AS total_carbs,
        COALESCE(SUM(fat_g), 0)::float AS total_fat
      FROM nutrition_logs
      WHERE user_id IS NULL AND logged_date = ${date}
    `
    const nut = (nutRows as any[])[0] ?? { total_protein: 0, total_carbs: 0, total_fat: 0 }

    const wkRows = await sql`
      SELECT COUNT(*)::int AS cnt FROM workout_logs WHERE user_id IS NULL AND logged_date = ${date}
    `
    const workoutDone = ((wkRows as any[])[0]?.cnt ?? 0) > 0

    const { score, proteinScore, carbsScore, fatScore, activityScore } = calculateHealthScore(
      nut.total_protein,
      nut.total_carbs,
      nut.total_fat,
      workoutDone
    )

    await sql`
      INSERT INTO health_scores
        (user_id, scored_date, score, protein_score, carbs_score, fat_score, activity_score)
      VALUES
        (NULL, ${date}, ${score}, ${proteinScore}, ${carbsScore}, ${fatScore}, ${activityScore})
      ON CONFLICT (scored_date) WHERE user_id IS NULL
      DO UPDATE SET
        score = EXCLUDED.score,
        protein_score = EXCLUDED.protein_score,
        carbs_score = EXCLUDED.carbs_score,
        fat_score = EXCLUDED.fat_score,
        activity_score = EXCLUDED.activity_score
    `
  } catch {
    // Never crash the parent mutation if health score fails
  }
}

export interface HealthScore {
  id: string
  scored_date: string
  score: number
  protein_score: number | null
  carbs_score: number | null
  fat_score: number | null
  activity_score: number | null
}

export async function getHealthScoresWeek(): Promise<HealthScore[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, scored_date::text, score, protein_score, carbs_score, fat_score, activity_score
    FROM health_scores
    WHERE user_id IS NULL AND scored_date >= CURRENT_DATE - INTERVAL '6 days'
    ORDER BY scored_date ASC
  `
  return rows as HealthScore[]
}

export async function getHealthScoresMonth(): Promise<HealthScore[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, scored_date::text, score, protein_score, carbs_score, fat_score, activity_score
    FROM health_scores
    WHERE user_id IS NULL AND scored_date >= DATE_TRUNC('month', CURRENT_DATE)
    ORDER BY scored_date ASC
  `
  return rows as HealthScore[]
}

export async function getHealthScoresAllTime(): Promise<HealthScore[]> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, scored_date::text, score, protein_score, carbs_score, fat_score, activity_score
    FROM health_scores
    WHERE user_id IS NULL
    ORDER BY scored_date ASC
    LIMIT 365
  `
  return rows as HealthScore[]
}

export async function getHealthScoreToday(): Promise<HealthScore | null> {
  await requireAuth()
  const rows = await sql`
    SELECT id::text, scored_date::text, score, protein_score, carbs_score, fat_score, activity_score
    FROM health_scores
    WHERE user_id IS NULL AND scored_date = CURRENT_DATE
    LIMIT 1
  `
  return ((rows as any[])[0] ?? null) as HealthScore | null
}
