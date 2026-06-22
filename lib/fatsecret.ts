// FatSecret Platform API — OAuth2 Client Credentials flow

interface TokenCache {
  token: string
  expiresAt: number
}

let _tokenCache: TokenCache | null = null

async function getAccessToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token
  }

  const clientId = process.env.FATSECRET_CLIENT_ID
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('FatSecret API keys not configured')

  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials&scope=basic',
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`FatSecret token error ${res.status}: ${body}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new Error('FatSecret: no access_token in response')

  _tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 86400) - 3600) * 1000,
  }
  return _tokenCache.token
}

export interface FoodSearchResult {
  food_id: string
  food_name: string
  food_description: string
  food_type: string
}

export function parseFoodDescription(desc: string): {
  per_g: number
  calories: number
  fat_g: number
  carbs_g: number
  protein_g: number
} {
  // "Per 100g - Calories: 89kcal | Fat: 0.33g | Carbs: 23.43g | Protein: 1.09g"
  const directG = desc.match(/Per (\d+)g -/)
  const servingG = desc.match(/Per .+?\((\d+(?:\.\d+)?)g\)/)
  const per_g = directG ? parseInt(directG[1]) : servingG ? parseFloat(servingG[1]) : 100

  const cal = (desc.match(/Calories:\s*([\d.]+)kcal/i) || [])[1]
  const fat = (desc.match(/Fat:\s*([\d.]+)g/i) || [])[1]
  const carbs = (desc.match(/Carbs:\s*([\d.]+)g/i) || [])[1]
  const protein = (desc.match(/Protein:\s*([\d.]+)g/i) || [])[1]

  return {
    per_g: per_g || 100,
    calories: parseFloat(cal ?? '0'),
    fat_g: parseFloat(fat ?? '0'),
    carbs_g: parseFloat(carbs ?? '0'),
    protein_g: parseFloat(protein ?? '0'),
  }
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const token = await getAccessToken()

  const url =
    `https://platform.fatsecret.com/rest/server.api` +
    `?method=foods.search` +
    `&format=json` +
    `&search_expression=${encodeURIComponent(query)}` +
    `&max_results=10`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`FatSecret search HTTP error: ${res.status}`)

  const data = await res.json()

  // FatSecret vrací chyby v body s HTTP 200
  if (data.error) {
    throw new Error(`FatSecret API error ${data.error.code}: ${data.error.message}`)
  }

  const foods = data.foods?.food
  if (!foods) return []
  return Array.isArray(foods) ? foods : [foods]
}
