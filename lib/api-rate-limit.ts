import { sql } from '@/lib/db'
import { ipRateKey } from '@/lib/security/client-ip'
import { createMemoryLimiter, type MemoryLimiter } from '@/lib/security/memory-limiter'

// Sdílený throttle nad tabulkou `api_requests` (endpoint, ip) pro všechny
// veřejné API route handlery (VIZEON/ALTENO booking, n8n leads). Dřív měl
// každý route soubor vlastní kopii — včetně stejného prune dotazu
// ("DELETE ... WHERE created_at < now() - interval '1 day'"), který se tak
// zbytečně zdvojoval při každém požadavku na kterýkoli z endpointů.
//
// Databázový limit je přesný, ale každý požadavek ho stojí dotaz do Neonu —
// i ten, který se zahodí. Při zahlcení by tak útočník zatěžoval databázi
// právě tím, proti čemu se limit staví. Proto před databází stojí paměťová
// pojistka (`lib/security/memory-limiter.ts`): klient, který za jedno okno
// pošle několikanásobek povoleného počtu, se zahodí bez jediného dotazu.

/**
 * Kolikrát víc požadavků než povolený počet smí klient poslat, než ho zastaví
 * paměťová pojistka. Čtyřnásobek je dost, aby se legitimní klient (opakování
 * po chybě, souběžné záložky) nikdy nedostal k hranici, a přitom dost nízko,
 * aby zahlcení skončilo dřív, než zasáhne databázi.
 */
export const PRE_GATE_FACTOR = 4

const preGates = new Map<string, MemoryLimiter>()

function preGateFor(windowMinutes: number, maxRequests: number): MemoryLimiter {
  const key = `${windowMinutes}:${maxRequests}`
  let gate = preGates.get(key)
  if (!gate) {
    gate = createMemoryLimiter({ max: maxRequests * PRE_GATE_FACTOR, windowMs: windowMinutes * 60_000 })
    preGates.set(key, gate)
  }
  return gate
}

export async function isApiRateLimited(
  endpoint: string,
  ip: string,
  windowMinutes: number,
  maxRequests: number,
): Promise<boolean> {
  // IPv6 po celé síti /64 i v databázi, ne jen v předbráně — jinak by šel
  // přesný limit obejít střídáním adres v jedné síti (audit 2026-11-24, #12).
  const key = ipRateKey(ip)
  if (preGateFor(windowMinutes, maxRequests).hit(`${endpoint}|${key}`).limited) return true

  const rows = await sql`
    SELECT count(*)::int AS count FROM api_requests
    WHERE endpoint = ${endpoint} AND ip = ${key}
      AND created_at > now() - interval '1 minute' * ${windowMinutes}
  `
  return (rows[0] as { count: number }).count >= maxRequests
}

export async function recordApiRequest(endpoint: string, ip: string): Promise<void> {
  // Úklid starých řádků jen občas: dřív běžel `DELETE` při každém požadavku,
  // takže zahlcení endpointu znamenalo dva zápisy do Neonu na jeden požadavek.
  // Řádek žije den a limity jsou v minutách, na přesném okamžiku mazání nezáleží.
  const writes = [sql`INSERT INTO api_requests (endpoint, ip) VALUES (${endpoint}, ${ipRateKey(ip)})`]
  if (Math.random() < 0.02) {
    writes.push(sql`DELETE FROM api_requests WHERE created_at < now() - interval '1 day'`)
  }
  // Nezávislé zápisy nad stejnou tabulkou — pořadí nehraje roli, souběžně
  // ušetří jeden HTTP round-trip oproti sekvenčnímu await.
  await Promise.all(writes)
}
