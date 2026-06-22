// Open Food Facts API — bez autentizace, bez IP omezení

export interface FoodSearchResult {
  food_id: string
  food_name: string
  food_description: string  // "na 100g — 89 kcal | B: 1g | S: 23g | T: 0g"
  per_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

interface OFFProduct {
  _id?: string
  product_name?: string
  product_name_cs?: string
  brands?: string
  completeness?: number
  unique_scans_n?: number
  nutriments?: {
    'energy-kcal_100g'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
  }
}

const BASE = 'https://world.openfoodfacts.org/cgi/search.pl'
const FIELDS = '_id,product_name,product_name_cs,brands,nutriments,completeness,unique_scans_n'

async function fetchOFF(query: string, extra: Record<string, string> = {}): Promise<OFFProduct[]> {
  const params = new URLSearchParams({
    action: 'process',
    search_terms: query,
    json: '1',
    page_size: '30',
    sort_by: 'unique_scans_n',
    fields: FIELDS,
    ...extra,
  })
  const res = await fetch(`${BASE}?${params}`, {
    headers: { 'User-Agent': 'ZakazIQ-Sport/1.0' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Open Food Facts error: ${res.status}`)
  const data = await res.json()
  return (data.products ?? []) as OFFProduct[]
}

function isValidProduct(p: OFFProduct): boolean {
  const n = p.nutriments
  if (!n) return false
  const cal = n['energy-kcal_100g'] ?? 0
  // kalorie musí být kladné a realistické (< 1000 kcal/100g)
  if (cal <= 0 || cal > 1000) return false
  // aspoň jeden makronutrient musí být vyplněn
  const hasNutrients = (n.proteins_100g ?? 0) + (n.carbohydrates_100g ?? 0) + (n.fat_100g ?? 0) > 0
  if (!hasNutrients) return false
  // musí mít název
  if (!p.product_name && !p.product_name_cs) return false
  return true
}

function toResult(p: OFFProduct): FoodSearchResult {
  const n = p.nutriments!
  const cal = Math.round(n['energy-kcal_100g']!)
  const prot = Math.round((n.proteins_100g ?? 0) * 10) / 10
  const carbs = Math.round((n.carbohydrates_100g ?? 0) * 10) / 10
  const fat = Math.round((n.fat_100g ?? 0) * 10) / 10
  const name = p.product_name_cs || p.product_name || 'Neznámý produkt'
  const brand = p.brands ? ` · ${p.brands.split(',')[0].trim()}` : ''

  return {
    food_id: p._id ?? Math.random().toString(36).slice(2),
    food_name: name + brand,
    food_description: `na 100g — ${cal} kcal | B: ${prot}g | S: ${carbs}g | T: ${fat}g`,
    per_g: 100,
    calories: cal,
    protein_g: prot,
    carbs_g: carbs,
    fat_g: fat,
  }
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  // Paralelní dotazy: preferujeme česká data + globální populární produkty
  const [czProducts, globalProducts] = await Promise.all([
    fetchOFF(query, { lc: 'cs', page_size: '20' }).catch(() => [] as OFFProduct[]),
    fetchOFF(query, { page_size: '20' }).catch(() => [] as OFFProduct[]),
  ])

  // Sloučení + deduplikace podle _id
  const seen = new Set<string>()
  const merged: OFFProduct[] = []
  for (const p of [...czProducts, ...globalProducts]) {
    const id = p._id ?? ''
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    merged.push(p)
  }

  return merged
    .filter(isValidProduct)
    // řadit: primárně completeness, sekundárně unique_scans_n
    .sort((a, b) => {
      const cDiff = (b.completeness ?? 0) - (a.completeness ?? 0)
      if (Math.abs(cDiff) > 0.1) return cDiff
      return (b.unique_scans_n ?? 0) - (a.unique_scans_n ?? 0)
    })
    .slice(0, 12)
    .map(toResult)
}
