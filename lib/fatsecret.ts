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
  nutriments?: {
    'energy-kcal_100g'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
  }
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?action=process` +
    `&search_terms=${encodeURIComponent(query)}` +
    `&json=1` +
    `&page_size=20` +
    `&fields=_id,product_name,product_name_cs,brands,nutriments`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'ZakazIQ-Sport/1.0' },
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`Open Food Facts error: ${res.status}`)

  const data = await res.json()
  const products: OFFProduct[] = data.products ?? []

  return products
    .filter(p =>
      p.nutriments?.['energy-kcal_100g'] != null &&
      (p.product_name || p.product_name_cs)
    )
    .slice(0, 12)
    .map(p => {
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
    })
}
