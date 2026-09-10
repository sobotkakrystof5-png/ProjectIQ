import { sql } from '@/lib/db'

// Sdílený throttle nad tabulkou `api_requests` (endpoint, ip) pro všechny
// veřejné API route handlery (VIZEON/ALTENO booking, n8n leads). Dřív měl
// každý route soubor vlastní kopii — včetně stejného prune dotazu
// ("DELETE ... WHERE created_at < now() - interval '1 day'"), který se tak
// zbytečně zdvojoval při každém požadavku na kterýkoli z endpointů.

export async function isApiRateLimited(
  endpoint: string,
  ip: string,
  windowMinutes: number,
  maxRequests: number,
): Promise<boolean> {
  const rows = await sql`
    SELECT count(*)::int AS count FROM api_requests
    WHERE endpoint = ${endpoint} AND ip = ${ip}
      AND created_at > now() - interval '1 minute' * ${windowMinutes}
  `
  return (rows[0] as { count: number }).count >= maxRequests
}

export async function recordApiRequest(endpoint: string, ip: string): Promise<void> {
  // Nezávislé zápisy nad stejnou tabulkou — pořadí nehraje roli, souběžně
  // ušetří jeden HTTP round-trip oproti sekvenčnímu await.
  await Promise.all([
    sql`INSERT INTO api_requests (endpoint, ip) VALUES (${endpoint}, ${ip})`,
    sql`DELETE FROM api_requests WHERE created_at < now() - interval '1 day'`,
  ])
}
